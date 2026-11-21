// A sign-in link (or GitHub) sends the browser away and back, so remember which page to return to.
const KEY = "nullform:return-to"
const MAX_AGE_MS = 60 * 60 * 1000

/** Where an auth redirect should land: the app root. The page is restored afterwards from storage. */
export const authRedirectUrl = () => `${location.origin}/`

export function rememberReturn(): void {
  try { localStorage.setItem(KEY, JSON.stringify({ hash: location.hash || "#/", at: Date.now() })) } catch { /* storage blocked: land on home */ }
}

/** Returns the remembered hash once (and clears it), or null if none or too old. */
export function consumeReturn(): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    localStorage.removeItem(KEY)
    const { hash, at } = JSON.parse(raw) as { hash: string; at: number }
    return typeof hash === "string" && hash.startsWith("#/") && Date.now() - at < MAX_AGE_MS ? hash : null
  } catch { return null }
}
