/**
 * Shared types used across the scanner pipeline.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingCategory =
  | 'secrets'
  | 'auth'
  | 'injection'
  | 'ssrf'
  | 'idor'
  | 'cors'
  | 'crypto'
  | 'dependency'
  | 'config'
  | 'other';

/**
 * Raw finding emitted by Semgrep before LLM filtering.
 */
export interface SemgrepFinding {
  ruleId: string;
  category: FindingCategory;
  message: string;
  severity: Severity;
  filePath: string;
  startLine: number;
  endLine: number;
  codeSnippet: string;
}

/**
 * Final, LLM-validated finding ready for PR comments or CLI output.
 * `confirmed: false` means the LLM flagged it as a false positive.
 */
export interface ReviewedFinding extends SemgrepFinding {
  confirmed: boolean;
  llmExplanation: string;
  suggestedFix?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ScanInput {
  /** Absolute path to the directory or file to scan. */
  target: string;
  /** Optional list of files to limit scanning to (useful for PR diffs). */
  changedFiles?: string[];
  /** Which Semgrep rules to run. Defaults to all in semgrep-rules/. */
  ruleset?: string;
}

export interface ScanResult {
  findings: ReviewedFinding[];
  stats: {
    filesScanned: number;
    semgrepFindings: number;
    confirmedFindings: number;
    falsePositives: number;
    durationMs: number;
    tokensUsed: { input: number; output: number };
  };
}
