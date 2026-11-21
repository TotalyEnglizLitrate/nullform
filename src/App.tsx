import { useEffect } from "react"
import { supabase } from "./lib/supabase.js"
import { useAuthNotice } from "./lib/authNotice.js"
import { consumeReturn } from "./lib/return.js"
import { href, useRoute } from "./lib/router.js"
import { useSession } from "./lib/session.js"
import { Audit } from "./pages/Audit.js"
import { Builder } from "./pages/Builder.js"
import { Dashboard } from "./pages/Dashboard.js"
import { FormPage } from "./pages/FormPage.js"
import { Home } from "./pages/Home.js"
import { Results } from "./pages/Results.js"

export function App() {
  const route = useRoute()
  const session = useSession()
  const [notice, dismissNotice] = useAuthNotice()
  const [, section, id] = route.split("/")

  // Back from an email link or GitHub: return to the page the person was on.
  useEffect(() => {
    if (!session) return
    const to = consumeReturn()
    if (to) location.hash = to
  }, [session])

  return (
    <>
      <header>
        <a className="brand" href={href("/")}>Nullform</a>
        <a href={href("/dashboard")}>My forms</a>
        <span className="grow" />
        {session && (
          <>
            <span className="muted">{session.user.email}</span>
            <button onClick={() => supabase.auth.signOut()}>Sign out</button>
          </>
        )}
      </header>
      <main>
        {notice && !session && (
          <p className="error" role="alert">{notice} <button onClick={dismissNotice}>Dismiss</button></p>
        )}
        {section === "dashboard" ? <Dashboard />
          : section === "new" ? <Builder />
          : section === "edit" && id ? <Builder formId={id} />
          : section === "results" && id ? <Results formId={id} />
          : section === "audit" && id ? <Audit formId={id} />
          : section === "f" && id ? <FormPage formId={id} />
          : <Home />}
      </main>
    </>
  )
}
