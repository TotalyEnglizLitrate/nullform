import { useEffect, useState } from "react"

/** Minimal hash router: "#/f/<id>" -> "/f/<id>". */
const current = () => location.hash.replace(/^#/, "") || "/"

export function useRoute(): string {
  const [route, setRoute] = useState(current)
  useEffect(() => {
    const on = () => setRoute(current())
    addEventListener("hashchange", on)
    return () => removeEventListener("hashchange", on)
  }, [])
  return route
}

export const href = (path: string) => `#${path}`
export const go = (path: string) => void (location.hash = path)
