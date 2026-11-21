import { verifyProof } from "@semaphore-protocol/proof"
import { db } from "./db.js"
import { loadForm } from "./forms.js"
import { HttpError, handler, json, readJson, sqlError } from "./http.js"
import { scopeFromFormId, signalFromPayload } from "../shared/hash.js"
import { isCanonicalDecimal, isFieldElement } from "../shared/leaves.js"
import { validatePayload } from "../shared/schema.js"

/** POST { formId, payload, proof }. No authentication: the proof is the credential. */
export const submit = handler(async (req) => {
  const body = await readJson(req)
  const form = await loadForm(body.formId)
  if (form.status !== "frozen" || !form.root) throw new HttpError(403, "submissions_closed")

  const proof = body.proof as Record<string, unknown> | undefined
  // Every number must be in its one canonical spelling. The verifier reads "07" and "7" as the same number, so a
  // nullifier written with a leading zero would verify yet count as a different value in the database, and
  // a member could answer twice. The nullifier and root must also be real field elements.
  if (
    !proof || typeof proof !== "object" ||
    typeof proof.merkleTreeDepth !== "number" ||
    !isFieldElement(proof.merkleTreeRoot) ||
    !isFieldElement(proof.nullifier) ||
    !isCanonicalDecimal(proof.message) ||
    !isCanonicalDecimal(proof.scope) ||
    !Array.isArray(proof.points) || proof.points.length !== 8 ||
    !proof.points.every((p) => isCanonicalDecimal(p))
  ) throw new HttpError(400, "invalid_proof")

  const invalid = validatePayload(form.schema, body.payload)
  if (invalid) throw new HttpError(400, "invalid_payload")

  // The proof must be bound to this form, this group and exactly these answers.
  if (proof.merkleTreeDepth !== form.merkle_depth) throw new HttpError(400, "wrong_depth")
  if (proof.merkleTreeRoot !== form.root) throw new HttpError(400, "wrong_root")
  if (proof.scope !== (await scopeFromFormId(form.id))) throw new HttpError(400, "wrong_scope")
  if (proof.message !== (await signalFromPayload(body.payload))) throw new HttpError(400, "signal_mismatch")

  let valid = false
  try {
    valid = await verifyProof(proof as unknown as Parameters<typeof verifyProof>[0])
  } catch {}
  if (!valid) throw new HttpError(400, "invalid_proof")

  const { error } = await db().rpc("submit_answers", {
    p_form: form.id,
    p_nullifier: proof.nullifier,
    p_signal: proof.message,
    p_proof: proof,
    p_payload: body.payload,
  })
  if (error) throw sqlError(error.message)
  return json(200, { ok: true, nullifier: proof.nullifier })
})
