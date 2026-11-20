import { useState } from "react"
import { supabase } from "./lib/supabase.js"

/** Email one-time code (works anywhere) and GitHub SSO. */
export function SignIn({ only }: { only?: "email" | "github" }) {
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function run(fn: () => Promise<{ error: { message: string } | null }>) {
    setBusy(true)
    setError("")
    const { error } = await fn()
    setBusy(false)
    if (error) setError(error.message)
    return !error
  }

  return (
    <div className="card">
      {only !== "github" && (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!sent) setSent(await run(() => supabase.auth.signInWithOtp({ email })))
            else await run(() => supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" }))
          }}
        >
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} disabled={sent} onChange={(e) => setEmail(e.target.value)} />
          {sent && (
            <>
              <label htmlFor="code">Six-digit code we emailed you</label>
              <input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" required
                pattern="[0-9]{6}" value={code} onChange={(e) => setCode(e.target.value)} />
            </>
          )}
          <p className="row">
            <button className="primary" disabled={busy}>{sent ? "Verify code" : "Email me a code"}</button>
            {sent && <button type="button" onClick={() => { setSent(false); setCode("") }}>Use another email</button>}
          </p>
        </form>
      )}
      {!only && <p className="muted">or</p>}
      {only !== "email" && (
        <button disabled={busy}
          onClick={() => run(() => supabase.auth.signInWithOAuth({ provider: "github", options: { redirectTo: location.href } }))}>
          Continue with GitHub
        </button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
