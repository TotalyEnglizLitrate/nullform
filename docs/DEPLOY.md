# Deploying Nullform

Hosting: **Vercel** serves the SPA and the three Node functions in `api/`. **Supabase** provides
Postgres and Auth. **GitHub Actions** (`.github/workflows/ci.yml`) tests every push and pull request,
and deploys `main` to production once the tests pass.

```
push / PR ──► test job: typecheck, local Supabase + Anvil, unit + integration tests, build
push to main ──► deploy job: supabase db push ──► vercel build ──► vercel deploy --prod
```

Vercel's own Git integration is switched off (`git.deploymentEnabled: false` in `vercel.json`), so
nothing reaches production without passing CI. Pull requests get CI only, no preview deployment:
previews would share the production database. Add Supabase branching or a second project first.

## One-time setup

### 1. Supabase (hosted)
1. Create a project. Pick a region close to the Vercel functions (default `iad1`; change `regions`
   in `vercel.json` to match).
2. Auth, URL configuration: set **Site URL** to the production URL, and add it to the redirect list.
3. Auth, Providers: enable **Email** (OTP, 6 digits) and **GitHub** (create an OAuth app on GitHub
   whose callback is `https://<project-ref>.supabase.co/auth/v1/callback`).
4. Auth, Email templates: set the "Magic Link" and "Confirm signup" bodies to the one in
   `supabase/templates/otp.html` so the email carries `{{ .Token }}`.
5. Auth, SMTP: configure a real SMTP provider. The built-in mailer is heavily rate-limited, so
   check current limits before a public demo.
6. Note the project ref, the DB password, and the API keys (publishable and secret).

### 2. Vercel
The project already exists (`vercel link`). Set these in **Project Settings, Environment Variables**
(Production):

| Variable | Value | Exposed to the browser |
|---|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` | no |
| `SUPABASE_SECRET_KEY` | the **secret** key (service role) | **never** |
| `VITE_SUPABASE_URL` | same URL | yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the **publishable** key | yes |
| `OPEN_DELAY_SECONDS` | e.g. `86400` | no |
| `ANCHOR_PRIVATE_KEY` | throwaway wallet key, **testnet funds only** | **never** |
| `ANCHOR_CHAIN` | `sepolia` | no |
| `ANCHOR_RPC_URL` | optional, your own RPC | no |
| `VITE_ANCHOR_ADDRESS` | the anchor wallet's public address | yes |

Anything prefixed `VITE_` is compiled into the public bundle. Never give a secret that prefix.
Mark `SUPABASE_SECRET_KEY` and `ANCHOR_PRIVATE_KEY` as **Sensitive**.

### 3. GitHub repository secrets
Under the `production` environment (Settings, Environments), so you can add required reviewers:

| Secret | Where to get it |
|---|---|
| `VERCEL_TOKEN` | Vercel account settings, Tokens |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | `.vercel/project.json` after `vercel link` |
| `SUPABASE_ACCESS_TOKEN` | Supabase account, Access Tokens |
| `SUPABASE_PROJECT_ID` | the project ref |
| `SUPABASE_DB_PASSWORD` | set when creating the project |

### 4. Fund the anchor wallet
Send ~0.05 Sepolia ETH to the wallet whose key is `ANCHOR_PRIVATE_KEY`. Without a key, freezing
still works; the form just has no on-chain timestamp, and the owner can press "Anchor now" later.

## Checking a deployment
1. Create a form, register with a second account, freeze, submit, open the audit page.
2. On the audit page, run "Verify in your browser" for the group, the anchor and the receipts.
3. Run `node scripts/export-anchors.mjs` (see the script header) and publish `anchors.json`
   to a public repository as an independent mirror of the anchored roots.

## Rolling back
Vercel keeps every deployment: promote an earlier one from the dashboard. Migrations are
forward-only, so write schema changes to be compatible with the previous release.
