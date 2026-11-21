import { useState } from "react"
import { authRedirectUrl, rememberReturn } from "./lib/return.js"
import { supabase } from "./lib/supabase.js"

/** Email sign-in link (works anywhere) and GitHub SSO. */
export function SignIn({ only }: { only?: "email" | "github" }) {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function run(fn: () => Promise<{ error: { message: string } | null }>) {
    setBusy(true)
    setError("")
    rememberReturn()
    const { error } = await fn()
    setBusy(false)
    if (error) setError(error.message)
    return !error
  }
  const sendLink = async () => setSent(await run(() =>
    supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirectUrl() } })))

  return (
    <div className="card">
      {only !== "github" && (sent ? (
        <div role="status">
          <p><strong>Check your email.</strong> We sent a sign-in link to {email}.</p>
          <p className="muted">
            Open the link in <strong>this same browser</strong>. It only works where you asked for it, and it can be used once.
            Some mail systems open links automatically and use them up; if it says the link has expired, request a new one.
          </p>
          <p className="row">
            <button disabled={busy} onClick={sendLink}>Send again</button>
            <button onClick={() => setSent(false)}>Use another email</button>
          </p>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void sendLink() }}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <p><button className="primary" disabled={busy}>Email me a sign-in link</button></p>
        </form>
      ))}
      {!only && !sent && <p className="muted">or</p>}
      {only !== "email" && !sent && (
        <button disabled={busy}
          onClick={() => run(() => supabase.auth.signInWithOAuth({ provider: "github", options: { redirectTo: authRedirectUrl() } }))}>
          Continue with GitHub
        </button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
