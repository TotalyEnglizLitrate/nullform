import { useEffect, useState } from "react"
import { Busy } from "../Busy.js"
import { SignIn } from "../SignIn.js"
import { explain, post } from "../lib/api.js"
import { deriveIdentity, newMaster } from "../lib/identity.js"
import { loadMaster, saveMaster } from "../lib/keystore.js"
import { useSession } from "../lib/session.js"
import { supabase } from "../lib/supabase.js"
import type { Form } from "../lib/types.js"
import { Backup } from "./Backup.js"

export function Register({ form }: { form: Form }) {
  const session = useSession()
  const [registered, setRegistered] = useState<boolean | null>(null)
  const [justDone, setJustDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!session) return setRegistered(null)
    void supabase.from("registrations").select("form_id").eq("form_id", form.id)
      .then(({ data }) => setRegistered((data ?? []).length > 0))
  }, [session, form.id])

  async function register() {
    setBusy(true)
    setError("")
    try {
      // One master secret per browser; the identity for this form is derived from it.
      let master = await loadMaster()
      if (!master) await saveMaster((master = newMaster()))
      const identity = await deriveIdentity(master, form.id)
      await post("register", { formId: form.id, commitment: identity.commitment.toString() }, session!.access_token)
      setRegistered(true)
      setJustDone(true)
    } catch (e) {
      setError(explain(e))
    }
    setBusy(false)
  }

  return (
    <>
      <h2>Register</h2>
      <p>
        Registration is open. Sign in, with email or GitHub, to join the group. The form checks your verified email address. Your account is
        only used to check eligibility; the identity you answer with is created in your browser and is not linked
        to your account on our servers.
      </p>
      {session === undefined ? null : !session ? <SignIn /> : registered ? (
        <p className="ok" role="status">
          You're registered. Come back when the owner has frozen the group and submissions open, using this same browser.
        </p>
      ) : (
        <p><button className="primary" disabled={busy || registered === null} aria-busy={busy} onClick={register}>
          <Busy busy={busy} idle="Register" doing="Registering" /></button></p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {(justDone || registered) && <Backup highlight={justDone} />}
    </>
  )
}
