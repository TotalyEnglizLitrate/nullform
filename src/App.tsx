import { useEffect, useState } from "react"
import { Busy } from "./Busy.js"
import { supabase } from "./lib/supabase.js"
import { Moon, Sun } from "./Icons.js"
import { LICENSE_URL, REPO_URL } from "./site.js"
import { useAuthNotice } from "./lib/authNotice.js"
import { consumeReturn } from "./lib/return.js"
import { href, useRoute } from "./lib/router.js"
import { useSession } from "./lib/session.js"
import { useTheme } from "./lib/theme.js"
import { About } from "./pages/About.js"
import { Anchors } from "./pages/Anchors.js"
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
  const [theme, toggleTheme] = useTheme()
  const [signingOut, setSigningOut] = useState(false)
  const [, section, id] = route.split("/")

  useEffect(() => { if (!session) setSigningOut(false) }, [session])
  async function signOut() {
    setSigningOut(true)
    const { error } = await supabase.auth.signOut()   // revokes the session on the server, which takes a moment
    if (error) setSigningOut(false)
  }

  // Back from an email link or GitHub: return to the page the person was on.
  useEffect(() => {
    if (!session) return
    const to = consumeReturn()
    if (to) location.hash = to
  }, [session])

  return (
    <div className="frame">
      <header>
        <a className="brand" href={href("/")}>NullForm</a>
        <a href={href("/dashboard")}>My forms</a>
        <span className="grow" />
        {session && <span className="email" title={session.user.email}>{session.user.email}</span>}
        {session && (
          <button onClick={signOut} disabled={signingOut} aria-busy={signingOut}>
            <Busy busy={signingOut} idle="Sign out" doing="Signing out" />
          </button>
        )}
        <button
          className="icon-button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </button>
      </header>
      <main>
        {notice && !session && (
          <p className="error" role="alert">{notice} <button onClick={dismissNotice}>Dismiss</button></p>
        )}
        {section === "about" ? <About />
          : section === "anchors" ? <Anchors />
          : section === "dashboard" ? <Dashboard />
          : section === "new" ? <Builder />
          : section === "edit" && id ? <Builder formId={id} />
          : section === "results" && id ? <Results formId={id} />
          : section === "audit" && id ? <Audit formId={id} />
          : section === "f" && id ? <FormPage formId={id} />
          : <Home />}
      </main>
      <footer>
        <span>
          NullForm is open source under the{" "}
          <a href={LICENSE_URL} target="_blank" rel="noreferrer noopener">MIT license</a>.
        </span>
        <a href={REPO_URL} target="_blank" rel="noreferrer noopener">Source on GitHub</a>
      </footer>
    </div>
  )
}
