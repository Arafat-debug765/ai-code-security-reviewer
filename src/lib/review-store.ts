import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ReviewedFinding, ScanResult } from '@/types';

/**
 * Helpers for the review tool.
 *
 * Data layout (all on the local filesystem — no DB):
 *
 *   scan-results/
 *     <repo-name>.json          ← scan output (CLI's --json mode writes these)
 *     <repo-name>.txt           ← optional human-readable scan output
 *     judgments.csv             ← append-only, one row per judged finding
 *
 * When the project graduates to Postgres in Weekend 3, the same data
 * shape lifts directly into the existing Prisma schema.
 */

const SCAN_RESULTS_DIR = path.join(process.cwd(), 'scan-results');
const JUDGMENTS_FILE = path.join(SCAN_RESULTS_DIR, 'judgments.csv');

export interface ScanFileMeta {
  scanId: string; // = filename without extension, used in URLs
  filename: string;
  repo: string;
  scannedAt: string; // ISO date from file mtime
  findingsCount: number;
  reviewedCount: number;
}

export interface ScanFileContent {
  scanId: string;
  repo: string;
  result: ScanResult;
  /**
   * Findings with judgments already loaded from judgments.csv, so the
   * UI can show "you've already reviewed 7/12" and skip ahead.
   */
  findings: Array<ReviewedFinding & { judgment?: Judgment }>;
}

export interface Judgment {
  scanId: string;
  findingIndex: number; // position in the original scan's findings[] array
  verdict: 'true_positive' | 'false_positive' | 'unsure';
  wouldRecommendOnPr: 'yes' | 'no';
  fixQuality: 'correct' | 'partial' | 'wrong' | 'na';
  notes: string;
  judgedAt: string; // ISO timestamp
}

const CSV_HEADERS = [
  'scan_id',
  'finding_index',
  'verdict',
  'would_recommend_on_pr',
  'fix_quality',
  'notes',
  'judged_at',
] as const;

async function ensureScanResultsDir(): Promise<void> {
  await fs.mkdir(SCAN_RESULTS_DIR, { recursive: true });
}

async function ensureJudgmentsFile(): Promise<void> {
  await ensureScanResultsDir();
  try {
    await fs.access(JUDGMENTS_FILE);
  } catch {
    await fs.writeFile(JUDGMENTS_FILE, CSV_HEADERS.join(',') + '\n', 'utf8');
  }
}

/**
 * Discover all scan JSON files in scan-results/ and return metadata.
 * Sorted newest first.
 */
export async function listScans(): Promise<ScanFileMeta[]> {
  await ensureScanResultsDir();
  const entries = await fs.readdir(SCAN_RESULTS_DIR);
  const jsonFiles = entries.filter(
    (f) => f.endsWith('.json') && f !== 'judgments.json',
  );

  const judgments = await loadJudgments();

  const metas = await Promise.all(
    jsonFiles.map(async (filename): Promise<ScanFileMeta> => {
      const scanId = filename.replace(/\.json$/, '');
      const full = path.join(SCAN_RESULTS_DIR, filename);
      const stat = await fs.stat(full);
      let findingsCount = 0;
      let repo = scanId;
      try {
        const content = JSON.parse(await fs.readFile(full, 'utf8')) as ScanResult;
        findingsCount = content.findings?.length ?? 0;
        // We don't have a repo name field on ScanResult, so derive from filename
        repo = scanId;
      } catch {
        // Skip unparseable files
      }
      const reviewedCount = judgments.filter((j) => j.scanId === scanId).length;
      return {
        scanId,
        filename,
        repo,
        scannedAt: stat.mtime.toISOString(),
        findingsCount,
        reviewedCount,
      };
    }),
  );
  return metas.sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
}

/**
 * Load a single scan file and merge in any existing judgments.
 */
export async function loadScan(scanId: string): Promise<ScanFileContent | null> {
  const safeId = sanitizeScanId(scanId);
  if (!safeId) return null;
  const filepath = path.join(SCAN_RESULTS_DIR, `${safeId}.json`);

  let raw: string;
  try {
    raw = await fs.readFile(filepath, 'utf8');
  } catch {
    return null;
  }

  const result = JSON.parse(raw) as ScanResult;
  const judgments = await loadJudgments();
  const myJudgments = judgments.filter((j) => j.scanId === safeId);

  const findings = result.findings.map((f, idx) => {
    const judgment = myJudgments.find((j) => j.findingIndex === idx);
    return { ...f, judgment };
  });

  return { scanId: safeId, repo: safeId, result, findings };
}

/**
 * Append a judgment to judgments.csv. Idempotent: if a judgment for the
 * same (scanId, findingIndex) already exists, it is overwritten.
 */
export async function saveJudgment(j: Judgment): Promise<void> {
  await ensureJudgmentsFile();
  const all = await loadJudgments();
  const remaining = all.filter(
    (existing) =>
      !(existing.scanId === j.scanId && existing.findingIndex === j.findingIndex),
  );
  remaining.push(j);

  const lines = [CSV_HEADERS.join(',')];
  for (const judgment of remaining) {
    lines.push(
      [
        csvEscape(judgment.scanId),
        String(judgment.findingIndex),
        judgment.verdict,
        judgment.wouldRecommendOnPr,
        judgment.fixQuality,
        csvEscape(judgment.notes),
        judgment.judgedAt,
      ].join(','),
    );
  }
  await fs.writeFile(JUDGMENTS_FILE, lines.join('\n') + '\n', 'utf8');
}

/**
 * Read all judgments from judgments.csv.
 */
export async function loadJudgments(): Promise<Judgment[]> {
  try {
    const content = await fs.readFile(JUDGMENTS_FILE, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    if (lines.length <= 1) return []; // only header or empty

    return lines.slice(1).map((line): Judgment => {
      const cols = parseCsvLine(line);
      return {
        scanId: cols[0] ?? '',
        findingIndex: Number(cols[1] ?? 0),
        verdict: (cols[2] ?? 'unsure') as Judgment['verdict'],
        wouldRecommendOnPr: (cols[3] ?? 'no') as Judgment['wouldRecommendOnPr'],
        fixQuality: (cols[4] ?? 'na') as Judgment['fixQuality'],
        notes: cols[5] ?? '',
        judgedAt: cols[6] ?? new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Read a source file from disk for showing code context in the review UI.
 * Limits to a window of ~30 lines around the finding.
 *
 * The path may be absolute (older scan output) or relative to the scanned
 * repo. We only read if the resolved path actually exists.
 */
export async function readSourceContext(
  filePath: string,
  startLine: number,
  endLine: number,
  contextLines = 8,
): Promise<{ lines: string[]; firstLineNumber: number } | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const all = content.split('\n');
    const start = Math.max(0, startLine - 1 - contextLines);
    const end = Math.min(all.length, endLine + contextLines);
    return {
      lines: all.slice(start, end),
      firstLineNumber: start + 1,
    };
  } catch {
    return null;
  }
}

// --- internal helpers -------------------------------------------------------

function sanitizeScanId(id: string): string | null {
  // Allow letters, digits, dashes, underscores, dots. No path separators.
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) return null;
  return id;
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === ',') {
        cols.push(current);
        current = '';
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        current += ch;
      }
    }
  }
  cols.push(current);
  return cols;
}
