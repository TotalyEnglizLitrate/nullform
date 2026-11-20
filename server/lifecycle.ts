import { Group } from "@semaphore-protocol/group"
import { authenticate } from "./auth.js"
import { db } from "./db.js"
import { loadAllowlist, loadForm } from "./forms.js"
import { HttpError, handler, json, readJson, sqlError } from "./http.js"
import { needsAllowlist, validateEligibility } from "./providers/index.js"
import { schemaHash } from "../shared/hash.js"
import { sortLeaves } from "../shared/leaves.js"
import { validateSchema } from "../shared/schema.js"

const openDelaySeconds = () => Number(process.env.OPEN_DELAY_SECONDS ?? 86400)

/** POST { formId, action: "open" | "freeze" | "close" } by the form owner. */
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
      // Phase 3: anchor `root` on an EVM testnet here and store anchor_tx.
      return json(200, {
        ok: true, root, leafCount: leaves.length,
        smallGroupWarning: leaves.length < form.min_group_size,
      })
    }
    case "close":
      await rpc("close_form", {})
      return json(200, { ok: true })
    default:
      throw new HttpError(400, "invalid_action")
  }
})
