import { useEffect, useState } from "react"
import { supabase } from "./supabase.js"

/**
 * Explains a failed return from an email link. With PKCE a link only completes in the browser that
 * requested it, and only once. Failures arrive two ways: an error in the URL hash (expired or already
 * used), or a `?code=` we couldn't exchange (opened somewhere else). Silence would leave people confused.
 */
export function useAuthNotice(): [string, () => void] {
  const [notice, setNotice] = useState("")
  useEffect(() => {
    const query = new URLSearchParams(location.search)
    const hash = new URLSearchParams(location.hash.replace(/^#\/?/, ""))
    const failed = query.get("error_description") ?? hash.get("error_description")
    const hadCode = query.has("code")
    if (!failed && !hadCode) return
    if (failed) {
      setNotice("That sign-in link has expired or was already used. Request a new one.")
      location.hash = "#/" // the error rode in on the hash; don't let it become the route
      return
    }
    // getSession resolves after the library has tried to exchange the code.
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session)
        setNotice("We couldn't finish signing you in. A sign-in link only works in the same browser where you asked for it, and only once. Request a new link here.")
    })
  }, [])
  return [notice, () => setNotice("")]
}
