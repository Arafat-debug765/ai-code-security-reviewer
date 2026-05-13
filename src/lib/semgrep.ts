import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SemgrepFinding, FindingCategory, Severity } from '@/types';

const RULES_DIR = path.join(process.cwd(), 'semgrep-rules');

/**
 * Run Semgrep against the target path with our custom ruleset.
 * Returns the raw findings before LLM filtering.
 *
 * Requires `semgrep` to be installed (`pipx install semgrep` or `brew install semgrep`).
 */
export async function runSemgrep(args: {
  target: string;
  changedFiles?: string[];
  rulesDir?: string;
}): Promise<SemgrepFinding[]> {
  const rulesDir = args.rulesDir ?? RULES_DIR;

  // Verify rules dir exists
  try {
    await fs.access(rulesDir);
  } catch {
    throw new Error(`Semgrep rules directory not found: ${rulesDir}`);
  }

  const cliArgs = [
    '--config',
    rulesDir,
    '--json',
    '--quiet',
    '--no-git-ignore',
    '--timeout',
    '30',
  ];

  // If specific changed files are given, scan only those (faster on PRs).
  if (args.changedFiles && args.changedFiles.length > 0) {
    cliArgs.push(...args.changedFiles);
  } else {
    cliArgs.push(args.target);
  }

  const stdout = await execSemgrep(cliArgs);
  return parseSemgrepOutput(stdout);
}

function execSemgrep(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('semgrep', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(
          new Error(
            'Semgrep is not installed. Install it with `pipx install semgrep` or `brew install semgrep`. ' +
              'See https://semgrep.dev/docs/getting-started/',
          ),
        );
      } else {
        reject(err);
      }
    });

    proc.on('close', (code) => {
      // Semgrep exits 0 (no findings), 1 (findings found), or >1 (error).
      if (code === 0 || code === 1) {
        resolve(stdout);
      } else {
        const detail = [
          stderr ? `STDERR:\n${stderr}` : '(no stderr)',
          stdout ? `STDOUT (first 2000 chars):\n${stdout.slice(0, 2000)}` : '(no stdout)',
        ].join('\n\n');
        reject(new Error(`Semgrep exited with code ${code}.\n${detail}`));
      }
    });
  });
}

interface SemgrepJsonResult {
  results: Array<{
    check_id: string;
    path: string;
    start: { line: number };
    end: { line: number };
    extra: {
      message: string;
      severity: string;
      lines: string;
      metadata?: {
        category?: string;
      };
    };
  }>;
  errors?: unknown[];
}

function parseSemgrepOutput(stdout: string): SemgrepFinding[] {
  if (!stdout.trim()) return [];

  let parsed: SemgrepJsonResult;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`Failed to parse Semgrep JSON output: ${(err as Error).message}`);
  }

  return parsed.results.map((r) => ({
    ruleId: r.check_id,
    category: mapCategory(r.extra.metadata?.category, r.check_id),
    message: r.extra.message,
    severity: mapSeverity(r.extra.severity),
    filePath: r.path,
    startLine: r.start.line,
    endLine: r.end.line,
    codeSnippet: r.extra.lines,
  }));
}

function mapSeverity(s: string): Severity {
  const lower = s.toLowerCase();
  if (lower.includes('error') || lower.includes('critical')) return 'critical';
  if (lower.includes('warning') || lower.includes('high')) return 'high';
  if (lower.includes('medium')) return 'medium';
  if (lower.includes('info')) return 'info';
  return 'low';
}

function mapCategory(
  metaCategory: string | undefined,
  ruleId: string,
): FindingCategory {
  if (metaCategory) {
    const known: FindingCategory[] = [
      'secrets',
      'auth',
      'injection',
      'ssrf',
      'idor',
      'cors',
      'crypto',
      'dependency',
      'config',
    ];
    if (known.includes(metaCategory as FindingCategory)) {
      return metaCategory as FindingCategory;
    }
  }
  // Fall back to rule-id heuristics.
  const id = ruleId.toLowerCase();
  if (id.includes('secret') || id.includes('apikey') || id.includes('token'))
    return 'secrets';
  if (id.includes('auth') || id.includes('jwt') || id.includes('session'))
    return 'auth';
  if (id.includes('sql') || id.includes('xss') || id.includes('injection'))
    return 'injection';
  if (id.includes('ssrf')) return 'ssrf';
  if (id.includes('idor')) return 'idor';
  if (id.includes('cors')) return 'cors';
  if (id.includes('crypto') || id.includes('hash')) return 'crypto';
  return 'other';
}
