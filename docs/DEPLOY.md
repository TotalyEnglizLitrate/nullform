# Deploying Nullform

Hosting: **Vercel** serves the SPA and the three Node functions in `api/`. **Supabase** provides
Postgres and Auth. **GitHub Actions** (`.github/workflows/ci.yml`) tests every push to `main`,
and deploys `main` to production once the tests pass.

```
push to main ──► test job: typecheck, local Supabase + Anvil, unit + integration tests, build
              └─► deploy job: supabase db push ──► vercel build ──► vercel deploy --prod
```

Vercel's own Git integration is switched off (`git.deploymentEnabled: false` in `vercel.json`), so
nothing reaches production without passing CI. There is no pull-request workflow and no preview
deployment (this is a solo project, and previews would share the production database). If that
changes, add a `pull_request` trigger for the test job, and use Supabase branching or a second
project before adding previews.

## One-time setup

### 1. Supabase (hosted)
1. Create a project. Pick a region close to the Vercel functions (this project uses Mumbai, `ap-south-1`,
   with Vercel's `bom1` set in `vercel.json`; the region can't be changed after creation).
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
| `SUPABASE_PROJECT_ID` | the project ref |
| `SUPABASE_DB_PASSWORD` | set when creating the project |

Migrations connect with the database password only, not a Supabase account token. An account
token reaches every organization and project you belong to, and has no narrower scope. Also set a
repository **variable** (not a secret) `SUPABASE_DB_HOST` to the project's session pooler host,
found in `supabase/.temp/pooler-url` after `supabase link` or in the dashboard under Connect
(for this project: `aws-1-ap-south-1.pooler.supabase.com`). The pooler is used because GitHub
runners lack IPv6 and the direct database host is IPv6-only on the free tier.

### 4. Turn deployment on
The `deploy` job is off by default. Once the secrets above exist, create a **repository variable**
(Settings, Secrets and variables, Variables) named `DEPLOY_ENABLED` with the value `true`.
Until then every push still runs the tests; nothing is deployed.

### 5. Fund the anchor wallet
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
