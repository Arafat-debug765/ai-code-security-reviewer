# Quickstart — 5 minutes to first scan

The fastest path to "is this thing actually useful?"

## Prerequisites

You need three things on your machine:

1. **Node.js 20+** — `node --version` (get from https://nodejs.org if needed)
2. **Semgrep** — `brew install semgrep` (macOS) or `pipx install semgrep` (Linux/WSL)
3. **An Anthropic API key** — sign up at https://console.anthropic.com, generate a key, put ~$20 of credit on the account

## Setup

```bash
cd ai-code-security-reviewer
npm install
cp .env.example .env
```

Open `.env` and replace `sk-ant-...` with your actual Anthropic API key.

## First scan

Pick any local code repo (your own project, or a small OSS one):

```bash
# Pull down a small Next.js app to test on
git clone --depth 1 https://github.com/vercel/next.js /tmp/nextjs-sample

# Run the scanner
npm run scan -- /tmp/nextjs-sample

# Or with cost/timing breakdown
npm run scan -- /tmp/nextjs-sample --bench

# Or see exactly what the GitHub PR comment would look like
npm run scan -- /tmp/nextjs-sample --preview
```

## What to do next

1. Read [docs/ROADMAP.md](docs/ROADMAP.md) for the full 4-weekend plan
2. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) to understand the design
3. Scan 5–10 real repos and judge the quality of findings — that's the real Weekend 1 work

If the quality is good enough, proceed to Weekend 2 (GitHub App).
If the quality is bad, iterate on `src/prompts/security-review.ts` and the rules in `semgrep-rules/` *before* building anything else.
