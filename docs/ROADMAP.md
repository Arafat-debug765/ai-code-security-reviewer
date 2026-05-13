# Roadmap

The 4-weekend MVP plan. Adjust pace to your reality, but keep the *order* — building the dashboard before the engine works is the most common failure mode.

---

## ✅ Weekend 1 — Core scanning engine (this repo, current state)

**Goal:** prove the Semgrep + Claude pipeline produces useful findings.

**Done in this scaffold:**
- [x] Project structure, TypeScript config, dependencies
- [x] Semgrep CLI wrapper with JSON parsing
- [x] Claude API integration with strict JSON output
- [x] Scanner orchestrator with bounded concurrency
- [x] Custom Semgrep ruleset (secrets, auth, ssrf/idor, injection)
- [x] System prompt for security review
- [x] CLI script (`npm run scan -- <path>`) with `--bench`, `--json`, `--preview` modes
- [x] Cost tracking

**Your work this weekend:**
1. Run `npm install` and the local setup steps in [SETUP.md](SETUP.md)
2. Scan 10–20 real OSS repos
3. For each finding, judge: "if this hit my PR, would I care?"
4. Iterate on `src/prompts/security-review.ts` and add/refine rules in `semgrep-rules/`
5. **Success criterion:** at least 80% of confirmed findings feel useful to a real maintainer

---

## Weekend 2 — GitHub App + PR comments

**Goal:** install on any GitHub repo and get automatic PR comments.

**Done in this scaffold (you'll wire up the credentials):**
- [x] Webhook route handler at `/api/github/webhook`
- [x] Signature verification
- [x] PR `opened` and `synchronize` handlers
- [x] Shallow clone + scan changed files only
- [x] Comment rendering with collapsible sections per finding
- [x] Prisma schema for installations, repos, scans, findings

**Your work:**
1. Set up Neon Postgres, run `npm run db:push`
2. Create a GitHub App following [SETUP.md § Weekend 2](SETUP.md#weekend-2-github-app--webhook)
3. Install on your own test repos
4. Open deliberately bad PRs (hardcoded keys, IDOR patterns) and verify comments appear
5. Tune the comment format: too long? too short? right severity?

**Success criterion:** comments appear within 60s of PR open, you'd be happy receiving them on your own repos.

---

## Weekend 3 — Public listing + dashboard

**Goal:** anyone on the internet can install the app and see their scans.

**To build:**
- [ ] Replace `src/app/dashboard/page.tsx` stub with real dashboard
- [ ] Add NextAuth.js with GitHub provider for dashboard auth
- [ ] Show installed repos, recent scans, basic usage stats per repo
- [ ] Per-repo toggles for which detector categories to run
- [ ] Publish the GitHub App to the [GitHub Marketplace](https://github.com/marketplace) as a free listing
- [ ] Polish the landing page; add 1–2 example PR comment screenshots
- [ ] **Start drafting the launch post:** "I scanned the top 100 Show HN repos for security bugs — here's what I found"

**Your work this weekend doubles as content prep for Weekend 4 launch.** Run your scanner on real public repos *while* building the dashboard. Anonymize any embarrassing findings before publishing. Patterns you find become your blog post and your roadmap.

**Success criterion:** an actual stranger can install the app, see their scans in the dashboard, and the experience doesn't embarrass you.

---

## Weekend 4 — Billing + launch

**Goal:** take money. Generate first paying customers.

**To build:**
- [ ] Stripe checkout flow for the Pro plan ($19/repo/month)
- [ ] `app/api/stripe/webhook/route.ts` to handle subscription created/updated/canceled
- [ ] Hard quota enforcement: free tier = 50 scans/month/repo on private repos, unlimited on public
- [ ] Quota banner in the dashboard when nearing limit
- [ ] Upgrade CTA in PR comment footer when quota is hit
- [ ] Per-repo "disable rule" toggles

**Launch:**
1. **Tuesday morning:** publish the "I scanned 100 Show HN repos" post to:
   - Hacker News (`Show HN: ...` or just standard post)
   - Twitter/X (thread, with the most surprising finding screenshot)
   - r/webdev, r/SaaS, r/programming, r/devops
   - Indie Hackers
2. **Tuesday afternoon:** DM the maintainers of repos where you found real (non-anonymized) bugs. Send them the fix privately, with no mention of the product. These become your loudest advocates.
3. **Wednesday:** submit to [Product Hunt](https://www.producthunt.com) for the following Tuesday launch
4. **All week:** respond to every comment, every email, every issue. Speed of response in week 1 determines your reputation.

**Success criterion:** 3–5 paying customers. Not 500 free signups. Five people whose pain is real enough to give you $19/month tells you the product works.

---

## After Weekend 4

Stop building features. The next 30 days are about:

1. **Talking to every paying customer.** What do they wish it did? What false positives are they seeing? Make a shared note.
2. **Reducing false-positive rate to <10%.** This is the single highest-leverage thing for retention.
3. **One marketing post per week.** Pattern: "Common bug type X — why even good engineers ship it." Each post drives signups for ~7 days.
4. **One new rule pack per month.** Pick a niche framework (Hono, Fastify, Express, NestJS) and write rules for it. Each pack lets you market to a new community.

### Things you'll be tempted to build but shouldn't (yet)

- Team accounts, seat-based pricing → keep it per-repo until at least 50 customers
- Self-hosted / on-prem version → enterprise dreams, indie nightmare
- IDE extension → distribution sink, not a product moat
- Slack/Discord notifications → PR comments *are* the notification
- A blog with SEO content marketing → write *one* great launch post + monthly follow-ups instead
- Multiple LLM providers → pick one, ship; switching is a one-day project later
- Custom rule authoring UI → let people email you their rule ideas; you write the YAML

### Things to build *only* when customers explicitly ask

- More language support (Python, Go, Ruby)
- GitLab / Bitbucket support
- Compliance report exports (SOC 2, ISO)
- Inline single-line PR comments (vs the current summary comment)

---

## Stretch: Months 2–6 — turning it into a real business

If Month 1 hits 10+ paying customers ($200+ MRR), here's the order of operations:

1. **Slack alert integration** — for teams managing many repos, PR comments aren't enough.
2. **Org-wide dashboard** — see scan history and trends across all your repos.
3. **Auto-fix PRs** — for high-confidence simple findings, open a fix PR instead of just commenting.
4. **AI-generated-code patterns** — new ruleset specifically targeting bugs common in LLM-written code (broken validation, missing auth checks the LLM omitted). This becomes your differentiator from Semgrep/Snyk.
5. **Compliance pack** — predefined rule bundles for SOC 2, HIPAA, PCI. Higher price tier ($99/repo/month).
6. **Hire one contractor part-time** — for support and rule-writing. Frees you to focus on product and marketing.

By Month 6, target: $5K MRR, ~250 active repos, false-positive rate <8%, 1 marketing post per week.

If you hit those numbers, you have a real business. If not, the data tells you whether to pivot (different niche, different positioning) or move on without having wasted a year.
