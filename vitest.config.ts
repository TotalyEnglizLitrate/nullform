import { defineConfig } from "vitest/config"

// Local `supabase start` development defaults (public, shared by every local stack).
// Override with real env vars to point the integration tests elsewhere.
const local = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
  SUPABASE_SECRET_KEY: "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz",
  MAILPIT_URL: "http://127.0.0.1:54324",
  OPEN_DELAY_SECONDS: "86400",
}

export default defineConfig({
  test: {
    env: Object.fromEntries(Object.entries(local).map(([k, v]) => [k, process.env[k] ?? v])),
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
