import { useEffect, useState } from "react"

export type Theme = "light" | "dark"
const KEY = "nullform:theme"
const dark = () => matchMedia("(prefers-color-scheme: dark)")

/** The theme in effect: an explicit choice if one was made, otherwise the system setting. */
const effective = (): Theme => {
  const set = document.documentElement.getAttribute("data-theme")
  return set === "light" || set === "dark" ? set : dark().matches ? "dark" : "light"
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(effective)
  useEffect(() => {
    const mql = dark()
    const follow = () => setTheme(effective()) // keeps the label right if the system theme changes
    mql.addEventListener("change", follow)
    return () => mql.removeEventListener("change", follow)
  }, [])
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark"
    document.documentElement.setAttribute("data-theme", next)
    try { localStorage.setItem(KEY, next) } catch { /* storage blocked: applies for this visit only */ }
    setTheme(next)
  }
  return [theme, toggle]
}
