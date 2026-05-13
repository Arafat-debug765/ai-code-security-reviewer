import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runSemgrep } from './semgrep';
import { reviewFinding } from './claude';
import type { ScanInput, ScanResult, SemgrepFinding } from '@/types';
import error from 'next/error';

const CONCURRENCY = 4; // parallel Claude calls
const CONTEXT_LINES = 8; // lines above/below for surrounding context

/**
 * Main scanning pipeline.
 *
 *   1. Run Semgrep against the target -> raw candidate findings
 *   2. For each finding, fetch surrounding code context
 *   3. Send each (finding + context) to Claude for confirm/reject
 *   4. Return only confirmed findings (plus stats for billing/analytics)
 */
export async function scan(input: ScanInput): Promise<ScanResult> {
  const startedAt = Date.now();

  const semgrepFindings = await runSemgrep({
    target: input.target,
    changedFiles: input.changedFiles,
  });

  const reviewed = await reviewInBatches(input.target, semgrepFindings);

  const confirmed = reviewed.filter((r) => r.reviewed.confirmed);
  const falsePositives = reviewed.length - confirmed.length;

  const tokensUsed = reviewed.reduce(
    (acc, r) => ({
      input: acc.input + r.usage.input,
      output: acc.output + r.usage.output,
    }),
    { input: 0, output: 0 },
  );

  return {
    findings: reviewed.map((r) => r.reviewed),
    stats: {
      filesScanned: input.changedFiles?.length ?? -1,
      semgrepFindings: semgrepFindings.length,
      confirmedFindings: confirmed.length,
      falsePositives,
      durationMs: Date.now() - startedAt,
      tokensUsed,
    },
  };
}

/**
 * Process Semgrep findings through Claude with bounded concurrency.
 * Worker pool pattern: keeps `CONCURRENCY` calls in flight at all times.
 */
async function reviewInBatches(
  target: string,
  findings: SemgrepFinding[],
): Promise<Array<{ reviewed: Awaited<ReturnType<typeof reviewFinding>>['reviewed']; usage: { input: number; output: number } }>> {
  const results: Array<{
    reviewed: Awaited<ReturnType<typeof reviewFinding>>['reviewed'];
    usage: { input: number; output: number };
  }> = [];

  let idx = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (idx < findings.length) {
      const myIdx = idx++;
      const finding = findings[myIdx];
      try {
        const context = await fetchSurroundingContext(target, finding);
        const result = await reviewFinding(finding, context);
        results[myIdx] = result;
      } catch (err) {
        console.error("Failed to review finding:", {
          ruleId: finding.ruleId,
          location: `${finding.filePath}:${finding.startLine}`,
          error,
        });
        // On error, treat as unconfirmed to avoid noisy false positives.
        results[myIdx] = {
          reviewed: {
            ...finding,
            confirmed: false,
            confidence: 'low',
            llmExplanation: 'Review failed; finding suppressed.',
          },
          usage: { input: 0, output: 0 },
        };
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Read the file and return a snippet of lines around the finding.
 * This gives Claude more context than just the offending lines —
 * which dramatically reduces false positives.
 */
async function fetchSurroundingContext(
  target: string,
  finding: SemgrepFinding,
): Promise<string | undefined> {
  const fullPath = path.isAbsolute(finding.filePath)
    ? finding.filePath
    : path.resolve(target, finding.filePath);

  try {
    const content = await fs.readFile(fullPath, 'utf8');
    const lines = content.split('\n');
    const start = Math.max(0, finding.startLine - 1 - CONTEXT_LINES);
    const end = Math.min(lines.length, finding.endLine + CONTEXT_LINES);
    return lines.slice(start, end).join('\n');
  } catch {
    return undefined;
  }
}
