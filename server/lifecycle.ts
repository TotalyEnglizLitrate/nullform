import { Group } from "@semaphore-protocol/group"
import { authenticate } from "./auth.js"
import { getAnchorer } from "./anchor.js"
import { db } from "./db.js"
import { loadAllowlist, loadForm } from "./forms.js"
import { HttpError, handler, json, readJson, sqlError } from "./http.js"
import { needsAllowlist, validateEligibility } from "./providers/index.js"
import { schemaHash } from "../shared/hash.js"
import { sortLeaves } from "../shared/leaves.js"
import { validateSchema } from "../shared/schema.js"

/** Sends the anchor transaction and records its hash. Never throws: returns what happened. */
async function anchorRoot(formId: string, ownerId: string, root: string): Promise<{ tx: string | null; problem?: string }> {
  const anchorer = getAnchorer()
  if (!anchorer) return { tx: null, problem: "not_configured" }
  try {
    const tx = await anchorer.anchor(formId, root)
    const { error } = await db().rpc("record_anchor", { p_form: formId, p_owner: ownerId, p_chain: anchorer.chain, p_tx: tx.toLowerCase() })
    if (error) throw new Error(error.message)
    return { tx }
  } catch (e) {
    console.error("anchor failed:", e instanceof Error ? e.message : e)
    return { tx: null, problem: "failed" }
  }
}

const openDelaySeconds = () => Number(process.env.OPEN_DELAY_SECONDS ?? 86400)

/** POST { formId, action: "open" | "freeze" | "anchor" | "close" } by the form owner. */
export const lifecycle = handler(async (req) => {
  const { user } = await authenticate(req)
  const body = await readJson(req)
  const form = await loadForm(body.formId)
  if (form.owner_id !== user.id) throw new HttpError(404, "form_not_found")
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await db().rpc(fn, { p_form: form.id, p_owner: user.id, ...args })
    if (error) throw sqlError(error.message)
  }

  switch (body.action) {
    case "open": {
      const problems = [...validateSchema(form.schema)]
      const policy = validateEligibility(form.eligibility)
      if (policy) problems.push(policy)
      else if (needsAllowlist(form.eligibility) && (await loadAllowlist(form.id)).length === 0)
        problems.push("allowlist is empty")
      if (problems.length) return json(400, { error: "invalid_form", problems })
      await rpc("open_registration", { p_schema_hash: await schemaHash(form.schema) })
      return json(200, { ok: true })
    }
    case "freeze": {
      // Step 1 flips the status (blocking registration). If an earlier attempt died after
      // step 1, the form is frozen without a root and we simply resume at step 2.
      if (form.status === "registration")
        await rpc("begin_freeze", { p_open_delay: `${openDelaySeconds()} seconds` })
      else if (!(form.status === "frozen" && form.root === null)) throw new HttpError(409, "wrong_status")

      const { data, error } = await db().from("commitments").select("commitment").eq("form_id", form.id)
      if (error) throw new HttpError(500, "internal_error")
      const leaves = sortLeaves((data ?? []).map((r) => r.commitment as string))
      const root = new Group(leaves).root.toString()
      await rpc("finalize_freeze", { p_root: root, p_leaf_count: leaves.length })
      // Anchoring is best effort: the freeze is already final, and a chain hiccup must not undo it.
      // If it fails, the owner can retry with action "anchor".
      const anchor = await anchorRoot(form.id, user.id, root)
      return json(200, {
        ok: true, root, leafCount: leaves.length,
        smallGroupWarning: leaves.length < form.min_group_size,
        anchored: anchor.tx !== null, anchorTx: anchor.tx, anchorProblem: anchor.problem,
      })
    }
    case "anchor": {
      const fresh = await loadForm(form.id)
      if (fresh.status !== "frozen" && fresh.status !== "closed") throw new HttpError(409, "wrong_status")
      if (!fresh.root) throw new HttpError(409, "wrong_status")
      if (fresh.anchor_tx) throw new HttpError(409, "already_anchored")
      const anchor = await anchorRoot(form.id, user.id, fresh.root)
      if (anchor.problem === "not_configured") throw new HttpError(503, "anchoring_disabled")
      if (!anchor.tx) throw new HttpError(502, "anchor_failed")
      return json(200, { ok: true, anchorTx: anchor.tx })
    }
    case "close":
      await rpc("close_form", {})
      return json(200, { ok: true })
    default:
      throw new HttpError(400, "invalid_action")
  }
})
