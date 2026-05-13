# Architecture

This document explains *why* the project is structured the way it is, so you can evolve it without breaking the assumptions.

## The core insight: two-stage detection

A pure-LLM approach (send the whole diff to Claude, ask it to find bugs) would cost too much per PR and miss things consistently. Pure static analysis (Semgrep alone) is fast and cheap but produces too many false positives to be tolerable on PRs.

**The architecture is two-stage:**

1. **Recall stage (Semgrep)** — fast, deterministic pattern matching with a curated ruleset. Optimized for catching everything, accepting noise.
2. **Precision stage (Claude)** — receives one Semgrep finding + surrounding code context at a time and decides whether it's a real issue. Optimized for killing noise.

This is the same pattern as a search engine: cast a wide net cheaply, then rerank with an expensive model. It's the only architecture that gives developers a tool they don't immediately mute.

## Data flow

```
                    ┌────────────────────────────────────────────────┐
                    │                  Trigger                        │
                    │   CLI: `npm run scan ./path`                    │
                    │   Or GitHub webhook: pull_request opened/sync   │
                    └─────────────────────┬──────────────────────────┘
                                          │
                                          ▼
                          ┌───────────────────────────────┐
                          │ src/lib/scanner.ts            │
                          │ scan(input: ScanInput)        │
                          └─────────────────┬─────────────┘
                                            │
                          ┌─────────────────┴─────────────────┐
                          ▼                                   ▼
              ┌───────────────────────┐         ┌──────────────────────────┐
              │ src/lib/semgrep.ts    │         │ For each finding:         │
              │ - spawns semgrep CLI  │         │ - read surrounding code   │
              │ - parses JSON output  │         │ - call Claude with prompt │
              │ - normalizes to       │         │ - parse JSON response     │
              │   SemgrepFinding[]    │         │ - mark confirmed/rejected │
              └───────────┬───────────┘         └─────────────┬────────────┘
                          │                                   │
                          └────────────────┬──────────────────┘
                                           ▼
                            ┌──────────────────────────┐
                            │ ScanResult                │
                            │ - findings: confirmed[]   │
                            │ - stats: timing, tokens   │
                            └──────────────┬───────────┘
                                           │
                          ┌────────────────┴────────────────┐
                          ▼                                  ▼
              ┌───────────────────────┐         ┌──────────────────────────┐
              │ CLI                   │         │ Webhook                  │
              │ → stdout (text/json)  │         │ → PR comment via GitHub  │
              │                       │         │ → persisted to Postgres  │
              └───────────────────────┘         └──────────────────────────┘
```

## File-by-file responsibility

### `src/lib/scanner.ts` — the orchestrator
Owns the pipeline. Two responsibilities:
1. Call Semgrep, get candidates
2. Run each candidate through Claude with bounded concurrency (default 4 parallel calls — balances Claude rate limits with PR latency)

Single entry point: `scan(input: ScanInput): Promise<ScanResult>`. Both the CLI and the webhook handler call this — no duplication.

### `src/lib/semgrep.ts` — static analyzer wrapper
Spawns the `semgrep` CLI and parses its JSON output. Handles edge cases: Semgrep's exit codes (0 = no findings, 1 = findings, >1 = error), missing rules dir, and missing binary.

The category mapping is intentionally heuristic (rule-name regex) so new rules don't need to set metadata explicitly to be categorized correctly.

### `src/lib/claude.ts` — LLM wrapper
Single function: `reviewFinding(finding, surroundingContext)`. Returns the reviewed finding + token usage.

Key design choice: **the LLM response is strict JSON, not free text.** A lenient parser handles model-wrapped markdown fences, but if parsing fails entirely, we treat it as an unconfirmed finding and log — never crash the scan.

### `src/prompts/security-review.ts` — the most important file
The system prompt is where 80% of the quality comes from. The architecture intentionally separates it from code so you can:
- A/B test prompts without touching the pipeline
- Track prompt versions in git
- Eventually load prompts from the database for per-user customization

**If false-positive rate is too high, fix the prompt, not the code.**

### `src/lib/github.ts` — GitHub integration
Two responsibilities:
1. Authenticate as a GitHub App installation
2. Render and post PR comments

The comment renderer is also used by the CLI's `--preview` flag, so you can see exactly what users will see without spinning up the webhook.

### `src/lib/db.ts` — Prisma client
Standard singleton pattern. Hot-reload-safe via `globalThis`.

### `src/app/api/github/webhook/route.ts` — webhook receiver
Verifies signature, dispatches by event type. For PR events, it:
1. Persists a `Scan` row with `status: 'running'`
2. Clones the repo at the head sha into a temp dir (shallow + single-sha fetch — fast)
3. Calls `scan(...)` on the changed files only
4. Persists findings + posts comment
5. Cleans up the temp dir

Returns 200 fast (within ~50ms) and processes async, so GitHub doesn't time out. Errors during async processing are caught and persisted to the `Scan.errorMessage` field.

## Why this stack

| Choice                  | Reason |
| ----------------------- | ------ |
| **Next.js**             | One framework for landing page, dashboard, and webhook handler. Vercel deploys are zero-config. |
| **Semgrep**             | Best open static analysis tool. Custom rules in YAML are easy to write and review. |
| **Claude Sonnet 4.5**   | Best precision/cost trade-off as of writing. Strong at structured JSON output. $3/$15 per M tokens vs Opus at $15/$75. |
| **Prisma + Postgres**   | Standard. Neon's free tier is generous. Migrations stay sane. |
| **Octokit**             | Official GitHub SDK. App auth handled correctly out of the box. |
| **TypeScript**          | Catches bugs the security tool wouldn't. Especially valuable in a security product. |

## What's deliberately *not* in the architecture

- **No queue (yet).** Webhook processes synchronously. Works fine up to ~1 scan/minute. When you outgrow this, add Inngest or Upstash QStash — minimal code change.
- **No caching of scan results.** Each PR sync triggers a full scan. Add a cache keyed on `(commitSha, changedFiles)` once you have repeat scanners.
- **No multi-tenant rules.** The Semgrep ruleset is global. Per-user custom rules belongs in `v2` once you have customers asking.
- **No streaming Claude responses.** Each finding's review is small (<1k output tokens). Streaming would add complexity without much UX win.

## Scaling failure modes (and when to fix them)

| Symptom                          | Fix                                  | When to bother |
| -------------------------------- | ------------------------------------ | -------------- |
| Webhook times out on large PRs   | Move scan to a queue (Inngest)       | First user complaint |
| Claude rate-limit errors         | Add token-bucket retry with backoff  | First 429       |
| Repo clone takes >30s            | Use GitHub Contents API for changed files instead of full clone | When clone time > 50% of scan time |
| DB connection pool exhausted     | Use Prisma's `pgbouncer=true` mode   | First "too many clients" error |
| Costs ballooning                 | Cache reviews keyed on rule_id + code hash | When monthly Claude spend > 30% of MRR |

Don't preemptively fix any of these. Each one is half a day of work and unlikely to bite before you have paying users.
