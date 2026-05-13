# Setup Guide

This document walks through the full setup, from running the local CLI to deploying the GitHub App on Vercel.

You can do this in stages — Weekend 1 only needs the first section.

---

## Weekend 1: Local CLI scanner

### 1. Install system prerequisites

**Node.js 20+**
```bash
node --version  # should print v20.x.x or higher
```

If not installed: https://nodejs.org or use `nvm install 20`.

**Semgrep** — the static analyzer that finds candidate issues.
```bash
# macOS
brew install semgrep

# Linux / WSL
pipx install semgrep
# or: python3 -m pip install --user semgrep

# Verify
semgrep --version
```

**A package manager** — pick one of `npm`, `pnpm`, or `yarn`. Examples below use `npm`.

### 2. Install project dependencies

```bash
cd ai-code-security-reviewer
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set `ANTHROPIC_API_KEY`. Get one at https://console.anthropic.com/settings/keys. Put $20 of credit on the account; that's enough for thousands of dev-scans.

You can ignore the GitHub, Stripe, and DATABASE_URL variables for now — they're only needed Weekend 2 onwards.

### 4. Run your first scan

Clone any small open-source Next.js or Express app and scan it:

```bash
git clone https://github.com/vercel/next-learn /tmp/next-learn
npm run scan -- /tmp/next-learn
```

You should see Semgrep findings, each filtered through Claude with an explanation and (often) a suggested fix.

Useful flags:
- `--bench` — show timing, token usage, and estimated $ cost
- `--json > out.json` — capture raw output for further analysis
- `--preview` — render the GitHub PR comment markdown as it would appear

### 5. Iterate on quality (the real Weekend 1 work)

This is the work that determines whether the product is worth building. The code is the easy half. **Quality of findings is the hard half.**

1. Scan 10–20 real repos. Save the JSON output of each scan.
2. For each finding, ask: "If this came in on my PR, would I care?"
3. If the answer is "no" too often, tune `src/prompts/security-review.ts`.
4. If Semgrep is missing real issues, add rules to `semgrep-rules/`.
5. Target: ≥80% of confirmed findings feel useful to a real maintainer.

**Track your false-positive rate** as you iterate. A simple spreadsheet works.

---

## Weekend 2: GitHub App + webhook

### 1. Set up a Postgres database

We'll use [Neon](https://neon.tech) (free tier is plenty for the first hundred users).

1. Sign up at https://neon.tech
2. Create a new project (any region close to where you'll deploy Vercel)
3. Copy the connection string from the dashboard
4. Add to `.env`:
   ```
   DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
   ```

Run the schema:
```bash
npm run db:push
npm run db:generate
```

### 2. Create the GitHub App

1. Go to https://github.com/settings/apps/new (or your org's apps page)
2. Fill in:
   - **GitHub App name:** something unique, e.g. `aicsr-dev` (you'll change this for prod)
   - **Homepage URL:** `http://localhost:3000` for dev, your Vercel URL for prod
   - **Webhook URL:** `http://localhost:3000/api/github/webhook` for dev. For local dev you'll need a tunnel (see below).
   - **Webhook secret:** generate a random string (`openssl rand -hex 32`) and paste here
   - **Permissions:**
     - Repository → Contents: **Read**
     - Repository → Pull requests: **Read and write** (for posting comments)
     - Repository → Metadata: **Read** (auto-selected)
   - **Subscribe to events:** `pull_request`, `installation`
   - **Where can this GitHub App be installed?** Any account
3. Click **Create GitHub App**.
4. On the next page, scroll down and click **Generate a private key**. A `.pem` file will download — keep it safe.

### 3. Wire credentials into `.env`

```bash
GITHUB_APP_ID=         # shown at the top of the app settings page
GITHUB_APP_WEBHOOK_SECRET= # the one you generated
GITHUB_APP_CLIENT_ID=  # in the app settings
GITHUB_APP_CLIENT_SECRET=  # click "Generate a new client secret"

# Paste the contents of the .pem file. Newlines escape to \n in single-line form.
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

### 4. Local webhook testing

GitHub can't reach `localhost`. Use a tunnel:

```bash
# Option A: smee.io (recommended — official GitHub tool)
npm install -g smee-client
smee --url https://smee.io/<your-channel> --target http://localhost:3000/api/github/webhook

# Option B: ngrok
ngrok http 3000
```

Update the **Webhook URL** in your GitHub App settings to the public tunnel URL.

### 5. Run the app

```bash
npm run dev
```

### 6. Install the App on a test repo

1. On the GitHub App settings page, click **Install App** in the sidebar
2. Choose a personal test repo (create a junk one if needed)
3. Open a PR with deliberately bad code — e.g. add a file with `const apiKey = "sk-ant-test-12345"` — and watch the comment appear

---

## Weekend 3: Deploy to Vercel

1. Push the repo to GitHub
2. Go to https://vercel.com/new and import the repo
3. Add **all** environment variables from `.env` to the Vercel project settings — don't forget `GITHUB_APP_PRIVATE_KEY` (multi-line PEM needs the `\n` escapes)
4. Deploy
5. Update your GitHub App's **Webhook URL** to `https://<your-domain>.vercel.app/api/github/webhook`
6. Verify by opening a new PR — comment should appear within ~30s

### Vercel-specific notes

- The webhook handler has `maxDuration = 300` (5 minutes). The Vercel Hobby tier caps at 60s, which works for small PR scans but breaks on large ones. Either upgrade to Pro or move scanning to a background queue (Inngest / Upstash QStash are the easiest).
- Set `NEXT_PUBLIC_APP_URL` to your Vercel domain so OAuth callbacks work later.

---

## Weekend 4: Stripe billing

1. Create a Stripe account at https://stripe.com
2. Create a product named "Pro" with a monthly recurring price of $19 USD
3. Copy the **Price ID** (starts with `price_`) into `STRIPE_PRICE_ID_PRO`
4. Add `STRIPE_SECRET_KEY` (from API keys page)
5. Create a webhook at https://dashboard.stripe.com/webhooks pointing at `https://<your-domain>.vercel.app/api/stripe/webhook` (you'll need to build this route — sketched out in `docs/ROADMAP.md`)
6. Copy the **Signing secret** into `STRIPE_WEBHOOK_SECRET`

---

## Troubleshooting

**"Semgrep is not installed"** — Run `which semgrep`. If empty, install it (see Weekend 1 step 1). If you used pipx, make sure `~/.local/bin` is in your PATH.

**"ANTHROPIC_API_KEY is not set"** — Verify `.env` exists in the project root and that the key is on a line by itself with no surrounding quotes (unless the value contains spaces).

**"Failed to parse LLM response"** — This means Claude returned non-JSON. Usually a one-off; check the logged response. If it happens >10% of the time, the system prompt needs tightening — the most common cause is an ambiguous user message.

**GitHub webhook returns 401** — Webhook secret mismatch. Double-check that the secret in your `.env` is identical to the one in the GitHub App settings.

**Scan takes > 60s on Vercel** — You're hitting the Hobby plan limit. Either upgrade to Pro (`maxDuration = 300`) or move scanning to a queue.

**False positive rate too high** — That's a prompt problem, not a code problem. Iterate on `src/prompts/security-review.ts`. Add concrete rejection examples to the "confirmed = false if ANY of these hold" list.
