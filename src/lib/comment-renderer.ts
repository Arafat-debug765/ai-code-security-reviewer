import type { ReviewedFinding, ScanResult } from '@/types';

/**
 * Format a ScanResult as a markdown PR comment.
 * Pure function — no GitHub/Octokit dependencies, safe to use from the CLI.
 */
export function renderComment(result: ScanResult): string {
  const { findings, stats } = result;

  if (findings.length === 0) {
    return `### 🛡️ Security review

No issues found across ${stats.semgrepFindings} candidates in ${Math.round(stats.durationMs / 1000)}s.

<sub>Powered by AI Code Security Reviewer</sub>`;
  }

  const groupedBySeverity: Record<string, ReviewedFinding[]> = {};
  for (const f of findings) {
    (groupedBySeverity[f.severity] ??= []).push(f);
  }

  const sections: string[] = [];
  for (const sev of ['critical', 'high', 'medium', 'low', 'info'] as const) {
    const group = groupedBySeverity[sev];
    if (!group?.length) continue;
    for (const f of group) {
      sections.push(renderFinding(f));
    }
  }

  return `### 🛡️ Security review — ${findings.length} issue${findings.length === 1 ? '' : 's'} found

${sections.join('\n\n')}

---
<sub>Scanned ${stats.semgrepFindings} candidates, suppressed ${stats.falsePositives} likely false positives. Powered by AI Code Security Reviewer.</sub>`;
}

function renderFinding(f: ReviewedFinding): string {
  const emoji = severityEmoji(f.severity);
  const fix = f.suggestedFix
    ? `\n\n**Suggested fix:**\n${f.suggestedFix}\n`
    : '';
  return `<details>
<summary>${emoji} <strong>${f.severity.toUpperCase()}</strong> · ${f.category} · ${f.filePath}:${f.startLine}</summary>

${f.llmExplanation}
${fix}
<sub>Rule: \`${f.ruleId}\` · Confidence: ${f.confidence}</sub>
</details>`;
}

function severityEmoji(s: string): string {
  return (
    {
      critical: '🚨',
      high: '⚠️',
      medium: '🔶',
      low: '🔹',
      info: 'ℹ️',
    } as Record<string, string>
  )[s] ?? '🔹';
}