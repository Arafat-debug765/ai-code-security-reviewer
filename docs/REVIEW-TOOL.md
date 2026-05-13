# Review tool

A local UI for judging scanner findings to build your evaluation dataset.

The review tool lives at `/review` inside the Next.js app. It reads scan JSON files from `scan-results/` on disk, lets you judge each finding one at a time with keyboard shortcuts, and appends your judgments to `scan-results/judgments.csv` as a portable, committable dataset.

No database, no auth — just the local filesystem.

## Quick start

```bash
# 1. Run a scan and save the JSON output
mkdir -p scan-results
npm run scan -- /path/to/some-repo --json > scan-results/some-repo.json

# 2. Start the Next.js app
npm run dev

# 3. Open the review tool
# Visit http://localhost:3000/review
```

You'll see the scan you just produced. Click it to start judging.

## The workflow per finding

For each finding the tool shows:

- File path, line number, severity badge, category, rule that fired
- The actual source code with the finding lines highlighted in red (more useful than the snippet alone)
- Claude's plain-English explanation and confidence rating
- Suggested fix (if any)

You answer four questions:

1. **Verdict** — Is this a real exploitable issue, in context?
   - `T` True positive
   - `F` False positive
   - `U` Unsure

2. **Would you want this comment on your PR?** — even if technically correct, would it feel useful or noisy on a real PR review?
   - `Y` Yes
   - `N` No

3. **Fix quality** — does the suggested fix actually fix it?
   - `C` Correct
   - `P` Partial
   - `W` Wrong
   - `X` N/A (no fix suggested or not applicable)

4. **Notes** — free text. Especially useful: if FP, what prompt rule would have caught it? If TP+wrong fix, what should the fix template say?

Then hit `Enter` to save and advance to the next finding.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `T` / `F` / `U` | Verdict |
| `Y` / `N` | Would-recommend-on-PR |
| `C` / `P` / `W` / `X` | Fix quality |
| `Enter` | Save current + go to next |
| `←` / `→` | Previous / next finding |

The tool auto-skips to the first un-judged finding when you open a scan, so you can pick up where you left off across sessions.

## Live precision tracker

The header shows running stats as you judge:

```
Finding 7/12 · 6 judged
Precision so far: 71% · Want on PR: 67%
```

Watch precision. If it falls below 80%, stop scanning and tune `src/prompts/security-review.ts` before adding more data — bad prompts amplify across every future scan.

## Output format

`scan-results/judgments.csv` is a normal CSV:

```csv
scan_id,finding_index,verdict,would_recommend_on_pr,fix_quality,notes,judged_at
vercel-commerce,0,true_positive,yes,correct,Real DoS vector...,2026-05-14T03:23:00Z
cal-com,0,false_positive,no,na,Auth handled by middleware not visible to scanner,2026-05-14T03:31:00Z
```

Commit it to your repo. It's small, portable, and survives every future architecture change. When Weekend 3 brings Postgres in, `judgments.csv` becomes a one-shot import script.

## Tips

- **Open the actual file alongside.** The source context window in the UI is helpful but limited. For tricky cases, open the file in your editor.
- **Use "Unsure" liberally.** If you'd need to read more of the codebase to call it, mark unsure. Treating ambiguous cases as TP or FP corrupts the data.
- **Notes are gold.** When you read 20 of them later, patterns jump out — and those patterns are exactly what to fix in the system prompt.
- **Re-judging is safe.** If you change your mind, just re-do that finding. The CSV gets rewritten with the new value.

## When this graduates to the real dashboard

Weekend 3 replaces this with a Postgres-backed multi-user dashboard. The data model is identical, so:

```sql
-- migration sketch
COPY findings_judgments FROM 'scan-results/judgments.csv' CSV HEADER;
```

Your current dataset comes along for the ride.
