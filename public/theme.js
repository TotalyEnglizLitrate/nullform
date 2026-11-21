// Applies a saved light/dark choice before first paint, so the page never flashes the wrong theme.
// External (not inline) because the CSP forbids inline scripts. Without a saved choice the page
// follows the system setting through CSS alone.
try {
  var saved = localStorage.getItem("nullform:theme")
  if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved)
} catch (e) { /* storage blocked: follow the system */ }
