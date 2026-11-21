import { useEffect, useState } from "react"
import { Busy } from "./Busy.js"
import { authRedirectUrl, rememberReturn } from "./lib/return.js"
import { supabase } from "./lib/supabase.js"

/** Email sign-in link (works anywhere) and GitHub SSO. */
export function SignIn({ only }: { only?: "email" | "github" }) {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)   // the email button only, not the GitHub one
  // GitHub: the whole page is about to be replaced, so stay busy until it really is (don't re-enable on return).
  const [redirecting, setRedirecting] = useState(false)
  useEffect(() => {
    // Back button restoring this page from the browser's cache: the earlier click is long over.
    const reset = (e: PageTransitionEvent) => { if (e.persisted) setRedirecting(false) }
    addEventListener("pageshow", reset)
    return () => removeEventListener("pageshow", reset)
  }, [])
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
  const github = async () => {
    setRedirecting(true)
    const ok = await run(() => supabase.auth.signInWithOAuth({ provider: "github", options: { redirectTo: authRedirectUrl() } }))
    if (!ok) setRedirecting(false) // on success the browser is already leaving
  }
  const sendLink = async () => {
    setSending(true)
    setSent(await run(() => supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirectUrl() } })))
    setSending(false)
  }

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
            <button disabled={busy || redirecting} aria-busy={sending} onClick={sendLink}><Busy busy={sending} idle="Send again" doing="Sending" /></button>
            <button onClick={() => setSent(false)}>Use another email</button>
          </p>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void sendLink() }}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <p><button className="primary" disabled={busy || redirecting} aria-busy={sending}><Busy busy={sending} idle="Email me a sign-in link" doing="Sending" /></button></p>
        </form>
      ))}
      {!only && !sent && <p className="muted">or</p>}
      {only !== "email" && !sent && (
        <button disabled={busy || redirecting} aria-busy={redirecting} onClick={github}>
          <Busy busy={redirecting} idle="Continue with GitHub" doing="Redirecting to GitHub" />
        </button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
