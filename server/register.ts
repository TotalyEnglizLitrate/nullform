import { authenticate } from "./auth.js"
import { db } from "./db.js"
import { loadAllowlist, loadForm } from "./forms.js"
import { HttpError, handler, json, readJson, sqlError } from "./http.js"
import { getProvider } from "./providers/index.js"
import { isCommitment } from "../shared/leaves.js"

/** POST { formId, commitment } with a Supabase bearer token. Registers the caller for the form. */
export const register = handler(async (req) => {
  const session = await authenticate(req)
  const body = await readJson(req)
  if (!isCommitment(body.commitment)) throw new HttpError(400, "invalid_commitment")
  const form = await loadForm(body.formId)
  if (form.status !== "registration") throw new HttpError(409, "registration_closed")

  const provider = getProvider(form.eligibility.provider)
  if (!provider) throw new HttpError(500, "internal_error")
  // One provider per form: a session from the other provider is refused outright.
  if (!provider.methods.includes(session.method)) throw new HttpError(403, "wrong_provider")
  const who = provider.identify(session.user, form.eligibility)
  if (!who) throw new HttpError(403, "unverified_identity")
  const allowlist = form.eligibility.mode === "any" ? [] : await loadAllowlist(form.id)
  if (!provider.isEligible(who, form.eligibility, allowlist)) throw new HttpError(403, "not_eligible")

  const { error } = await db().rpc("register_member", {
    p_form: form.id,
    p_user: session.user.id,
    p_subject: who.subject,
    p_commitment: body.commitment,
  })
  if (error) throw sqlError(error.message)
  return json(200, { ok: true })
})
