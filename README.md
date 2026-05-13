# AI Code Security Reviewer

AI-powered security review for indie hackers and small teams. Combines Semgrep static analysis with Claude as a false-positive filter, then posts findings as PR comments on GitHub.

> **Status: Weekend 1 deliverable.** The CLI scanner is fully functional. The GitHub App, Next.js dashboard, and Stripe billing are scaffolded for Weekends 2–4. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Why this exists

Enterprise SAST tools (Snyk, Veracode, Semgrep Pro) cost hundreds per developer per month and drown small teams in false positives. Indie hackers shipping fast on Next.js + Supabase + Vercel have **no affordable, low-noise option** — yet they're the most exposed (leaked API keys, broken auth, IDOR bugs in public APIs).

This tool fills that gap with a focused ruleset for common indie-hacker stacks, plus an LLM filter that removes the obvious false positives before they hit your PR.

---

## What it catches

- Hardcoded secrets and API keys (Anthropic, OpenAI, AWS, Stripe, GitHub, JWT)
- Missing auth checks in Next.js API routes
- IDOR (insecure direct object reference) in Prisma queries
- SSRF and open redirects
- SQL injection in raw queries
- Insecure cookie flags, JWT misconfigurations
- Wildcard CORS, eval/exec with user input
- `NEXT_PUBLIC_*` env vars containing secrets

See [`semgrep-rules/`](semgrep-rules/) for the full ruleset and add your own as you discover patterns.

---

## Quick start (5 minutes)

### Prerequisites

1. **Node.js ≥ 20** — `node --version`
2. **Semgrep** — `pipx install semgrep` or `brew install semgrep`. Verify with `semgrep --version`.
3. **An Anthropic API key** — get one at https://console.anthropic.com. $20 of credit is enough for thousands of scans.

### Setup

```bash
# 1. Install deps
npm install              # or pnpm install / yarn

# 2. Configure
cp .env.example .env
# Edit .env and paste your ANTHROPIC_API_KEY

# 3. Run a scan on any local repo
npm run scan -- ./path/to/some/repo

# 4. See the bench / cost breakdown
npm run scan -- ./path/to/some/repo --bench

# 5. Preview the PR comment it would post
npm run scan -- ./path/to/some/repo --preview
```

That's it. The CLI doesn't need GitHub or a database. Use it to iterate on the prompt and ruleset before wiring up the GitHub App.

---

## Project layout

```
ai-code-security-reviewer/
├── src/
│   ├── lib/
│   │   ├── claude.ts       # LLM filter (sends findings to Claude)
│   │   ├── semgrep.ts      # Semgrep CLI wrapper
│   │   ├── scanner.ts      # Orchestrator: Semgrep → Claude → results
│   │   ├── github.ts       # PR comment posting + comment rendering
│   │   └── db.ts           # Prisma client
│   ├── prompts/
│   │   └── security-review.ts   # The system prompt (most important file)
│   ├── app/
│   │   ├── page.tsx                              # Landing page
│   │   ├── dashboard/page.tsx                    # Dashboard (Weekend 3)
│   │   └── api/github/webhook/route.ts           # GitHub webhook (Weekend 2)
│   └── types/index.ts
├── semgrep-rules/        # Custom ruleset (the seed for detection quality)
│   ├── secrets.yaml
│   ├── auth.yaml
│   ├── ssrf.yaml
│   └── injection.yaml
├── scripts/
│   └── scan-local.ts     # The Weekend 1 CLI you can run right now
├── prisma/schema.prisma
└── docs/
    ├── SETUP.md          # Full setup including GitHub App + Vercel deploy
    ├── ARCHITECTURE.md   # How the pipeline works
    └── ROADMAP.md        # Weekend-by-weekend plan
```

---

## How it works

```
Pull request opened
       │
       ▼
┌──────────────┐    ┌─────────────────────┐    ┌──────────────────┐
│ Webhook      │───▶│ Semgrep             │───▶│ Claude filter    │
│ receiver     │    │ (custom ruleset)    │    │ (false-positive  │
│              │    │                     │    │  rejection +     │
│              │    │ ~10–50 candidates   │    │  fix suggestion) │
└──────────────┘    └─────────────────────┘    └────────┬─────────┘
                                                        │
                                                        ▼
                                              ┌──────────────────┐
                                              │ PR comment       │
                                              │ (collapsible     │
                                              │  per finding)    │
                                              └──────────────────┘
```

Semgrep is the recall engine — fast, deterministic, finds the candidates. Claude is the precision filter — slow, expensive per call, but kills the noise. The combination is what makes the product actually usable on PRs without tuning out developers.

---

## Cost per scan (current model)

Default model: `claude-sonnet-4-5` at $3 / $15 per million tokens (input / output).

Per typical PR scan with ~5 candidates:
- ~5,000 input tokens + ~1,000 output tokens
- **~$0.03 per scan**

A free-tier user doing 50 scans/month costs you about **$1.50 in API fees**, comfortably under a hypothetical $19/repo/month paid plan.

Use `npm run scan -- <path> --bench` to see exact token usage and cost for your specific repos.

---

## Roadmap

- **Weekend 1 ✅** — CLI scanner with Semgrep + Claude pipeline
- **Weekend 2** — GitHub App, webhook handler, PR comments
- **Weekend 3** — Dashboard, GitHub auth, public marketplace listing
- **Weekend 4** — Stripe billing, launch (HN, Product Hunt, "I scanned 100 Show HN repos")

Full plan in [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Contributing

This is a solo founder project, but issues and PRs are welcome. The most valuable contributions:

1. **New Semgrep rules** for common indie-hacker bug patterns. See [`semgrep-rules/`](semgrep-rules/) for examples.
2. **Prompt improvements** that reduce false positives without missing real bugs. Track measurements in `scan-results/`.
3. **Framework adapters** — e.g., Express, Fastify, Hono detection patterns for the auth ruleset.

---

## License

MIT. See [LICENSE](LICENSE).
