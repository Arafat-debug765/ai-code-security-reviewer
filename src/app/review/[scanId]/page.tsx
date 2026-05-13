'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface SourceContext {
  lines: string[];
  firstLineNumber: number;
}

interface Finding {
  ruleId: string;
  category: string;
  severity: string;
  filePath: string;
  startLine: number;
  endLine: number;
  codeSnippet: string;
  confirmed: boolean;
  confidence: string;
  llmExplanation: string;
  suggestedFix?: string;
  sourceContext: SourceContext | null;
  judgment?: {
    verdict: 'true_positive' | 'false_positive' | 'unsure';
    wouldRecommendOnPr: 'yes' | 'no';
    fixQuality: 'correct' | 'partial' | 'wrong' | 'na';
    notes: string;
  };
}

interface ScanData {
  scanId: string;
  repo: string;
  findings: Finding[];
  stats: {
    semgrepFindings: number;
    confirmedFindings: number;
    falsePositives: number;
    durationMs: number;
    tokensUsed: { input: number; output: number };
  };
}

export default function ReviewScanPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const scanId = decodeURIComponent(params.scanId as string);

  const [scan, setScan] = useState<ScanData | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for the current finding
  const [verdict, setVerdict] = useState<'' | 'true_positive' | 'false_positive' | 'unsure'>('');
  const [pr, setPr] = useState<'' | 'yes' | 'no'>('');
  const [fixQ, setFixQ] = useState<'' | 'correct' | 'partial' | 'wrong' | 'na'>('');
  const [notes, setNotes] = useState('');
  const [notesFocused, setNotesFocused] = useState(false);

  // Load scan once
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/scan-file/${encodeURIComponent(scanId)}`)
      .then((r) => r.json())
      .then((data: ScanData | { error: string }) => {
        if (!active) return;
        if ('error' in data) {
          setError(data.error);
        } else {
          setScan(data);
          // Jump to first un-judged finding
          const firstUnjudged = data.findings.findIndex((f) => !f.judgment);
          setCurrentIdx(firstUnjudged === -1 ? 0 : firstUnjudged);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(String(err));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scanId]);

  // Sync form state when navigating between findings
  useEffect(() => {
    if (!scan) return;
    const f = scan.findings[currentIdx];
    if (!f) return;
    setVerdict(f.judgment?.verdict ?? '');
    setPr(f.judgment?.wouldRecommendOnPr ?? '');
    setFixQ(f.judgment?.fixQuality ?? '');
    setNotes(f.judgment?.notes ?? '');
  }, [scan, currentIdx]);

  const current = scan?.findings[currentIdx];
  const total = scan?.findings.length ?? 0;
  const judged = scan?.findings.filter((f) => f.judgment).length ?? 0;

  const stats = useMemo(() => {
    if (!scan) return null;
    const judgedFindings = scan.findings.filter((f) => f.judgment);
    const tp = judgedFindings.filter((f) => f.judgment!.verdict === 'true_positive').length;
    const fp = judgedFindings.filter((f) => f.judgment!.verdict === 'false_positive').length;
    const unsure = judgedFindings.filter((f) => f.judgment!.verdict === 'unsure').length;
    const wantOnPr = judgedFindings.filter(
      (f) => f.judgment!.wouldRecommendOnPr === 'yes',
    ).length;
    const precision = tp + fp === 0 ? null : tp / (tp + fp);
    const prRate = judgedFindings.length === 0 ? null : wantOnPr / judgedFindings.length;
    return { tp, fp, unsure, precision, prRate };
  }, [scan]);

  const save = useCallback(
    async (overrideNotes?: string): Promise<boolean> => {
      if (!scan || !current) return false;
      if (!verdict || !pr || !fixQ) return false;
      setSaving(true);
      try {
        const res = await fetch('/api/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scanId: scan.scanId,
            findingIndex: currentIdx,
            verdict,
            wouldRecommendOnPr: pr,
            fixQuality: fixQ,
            notes: overrideNotes ?? notes,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(`Save failed: ${JSON.stringify(j)}`);
          return false;
        }
        // Optimistically update local state so progress counter advances
        setScan((prev) => {
          if (!prev) return prev;
          const updated = [...prev.findings];
          updated[currentIdx] = {
            ...updated[currentIdx],
            judgment: {
              verdict: verdict as Exclude<typeof verdict, ''>,
              wouldRecommendOnPr: pr as Exclude<typeof pr, ''>,
              fixQuality: fixQ as Exclude<typeof fixQ, ''>,
              notes: overrideNotes ?? notes,
            },
          };
          return { ...prev, findings: updated };
        });
        return true;
      } finally {
        setSaving(false);
      }
    },
    [scan, current, currentIdx, verdict, pr, fixQ, notes],
  );

  const next = useCallback(() => {
    if (!scan) return;
    setCurrentIdx((idx) => Math.min(idx + 1, scan.findings.length - 1));
  }, [scan]);

  const prev = useCallback(() => {
    setCurrentIdx((idx) => Math.max(idx - 1, 0));
  }, []);

  const saveAndNext = useCallback(async () => {
    const ok = await save();
    if (ok) next();
  }, [save, next]);

  // Keyboard shortcuts (disabled while typing notes)
  useEffect(() => {
    if (notesFocused) return;
    const handler = (e: KeyboardEvent): void => {
      // Ignore if user is typing in any input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      switch (e.key.toLowerCase()) {
        case 't': setVerdict('true_positive'); break;
        case 'f': setVerdict('false_positive'); break;
        case 'u': setVerdict('unsure'); break;
        case 'y': setPr('yes'); break;
        case 'n': setPr('no'); break;
        case 'c': setFixQ('correct'); break;
        case 'p': setFixQ('partial'); break;
        case 'w': setFixQ('wrong'); break;
        case 'x': setFixQ('na'); break;
        case 'enter':
          e.preventDefault();
          void saveAndNext();
          break;
        case 'arrowright': next(); break;
        case 'arrowleft': prev(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [notesFocused, saveAndNext, next, prev]);

  if (loading) {
    return <div className="p-8 text-zinc-400">Loading scan…</div>;
  }
  if (error) {
    return (
      <div className="p-8">
        <Link href="/review" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Back to scans
        </Link>
        <p className="mt-4 text-rose-400">Error: {error}</p>
      </div>
    );
  }
  if (!scan || !current) {
    return (
      <div className="p-8 text-zinc-400">
        <Link href="/review" className="text-sm hover:text-zinc-200">
          ← Back to scans
        </Link>
        <p className="mt-4">No findings in this scan.</p>
      </div>
    );
  }

  const canSave = verdict && pr && fixQ;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/review" className="text-sm text-zinc-400 hover:text-zinc-200">
            ← Back to scans
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{scan.repo}</h1>
        </div>
        <div className="text-right text-sm">
          <div className="text-zinc-300">
            Finding {currentIdx + 1} / {total} · {judged} judged
          </div>
          {stats && stats.precision !== null && (
            <div className="text-zinc-500">
              Precision so far: {(stats.precision * 100).toFixed(0)}% · Want on PR: {stats.prRate !== null ? (stats.prRate * 100).toFixed(0) : 0}%
            </div>
          )}
        </div>
      </header>

      <FindingPanel finding={current} />

      <div className="mt-6 space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <QuestionRow
          label="Verdict"
          help="Is this a real, exploitable issue in context?"
          options={[
            { value: 'true_positive', label: 'True positive', key: 'T' },
            { value: 'false_positive', label: 'False positive', key: 'F' },
            { value: 'unsure', label: 'Unsure', key: 'U' },
          ]}
          value={verdict}
          onChange={(v) => setVerdict(v as typeof verdict)}
        />

        <QuestionRow
          label="Would you want this comment on your PR?"
          help="Even if it's technically correct, would it feel useful or noisy?"
          options={[
            { value: 'yes', label: 'Yes', key: 'Y' },
            { value: 'no', label: 'No', key: 'N' },
          ]}
          value={pr}
          onChange={(v) => setPr(v as typeof pr)}
        />

        <QuestionRow
          label="Quality of suggested fix"
          options={[
            { value: 'correct', label: 'Correct', key: 'C' },
            { value: 'partial', label: 'Partial', key: 'P' },
            { value: 'wrong', label: 'Wrong', key: 'W' },
            { value: 'na', label: 'N/A', key: 'X' },
          ]}
          value={fixQ}
          onChange={(v) => setFixQ(v as typeof fixQ)}
        />

        <div>
          <label className="block text-sm text-zinc-300">
            Notes <span className="text-zinc-500">(why TP/FP, what prompt rule would fix it)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onFocus={() => setNotesFocused(true)}
            onBlur={() => setNotesFocused(false)}
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
            rows={3}
            placeholder="e.g. False positive: the route below uses requireAuth() via a higher-order wrapper. Prompt should detect HOC auth patterns."
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-zinc-500">
            Shortcuts: <Kbd>T</Kbd>/<Kbd>F</Kbd>/<Kbd>U</Kbd> verdict · <Kbd>Y</Kbd>/<Kbd>N</Kbd> PR · <Kbd>C</Kbd>/<Kbd>P</Kbd>/<Kbd>W</Kbd>/<Kbd>X</Kbd> fix · <Kbd>Enter</Kbd> save & next · <Kbd>←</Kbd>/<Kbd>→</Kbd> navigate
          </div>
          <div className="flex gap-2">
            <button
              onClick={prev}
              disabled={currentIdx === 0}
              className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"
            >
              ← Prev
            </button>
            <button
              onClick={next}
              className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Skip →
            </button>
            <button
              onClick={saveAndNext}
              disabled={!canSave || saving}
              className="rounded bg-white px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-30"
            >
              {saving ? 'Saving…' : 'Save & next'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function FindingPanel({ finding }: { finding: Finding }): React.ReactElement {
  const sevColor: Record<string, string> = {
    critical: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    high: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    medium: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    low: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    info: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  };
  return (
    <article className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <span
          className={`rounded border px-2 py-0.5 text-xs font-medium uppercase ${
            sevColor[finding.severity] ?? sevColor.info
          }`}
        >
          {finding.severity}
        </span>
        <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
          {finding.category}
        </span>
        <span className="font-mono text-xs text-zinc-500">{finding.ruleId}</span>
        <span className="ml-auto font-mono text-xs text-zinc-400">
          {finding.filePath}:{finding.startLine}
        </span>
      </header>

      {finding.sourceContext ? (
        <SourceBlock
          lines={finding.sourceContext.lines}
          firstLineNumber={finding.sourceContext.firstLineNumber}
          highlightStart={finding.startLine}
          highlightEnd={finding.endLine}
        />
      ) : (
        <pre className="overflow-x-auto rounded bg-zinc-950 p-3 text-xs text-zinc-200">
          {finding.codeSnippet}
        </pre>
      )}

      <div className="mt-4">
        <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">
          Claude's analysis · confidence: {finding.confidence}
        </div>
        <p className="text-sm text-zinc-200">{finding.llmExplanation}</p>
      </div>

      {finding.suggestedFix && (
        <div className="mt-4">
          <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">
            Suggested fix
          </div>
          <pre className="overflow-x-auto rounded bg-zinc-950 p-3 text-xs text-zinc-100">
            {finding.suggestedFix}
          </pre>
        </div>
      )}
    </article>
  );
}

function SourceBlock(props: {
  lines: string[];
  firstLineNumber: number;
  highlightStart: number;
  highlightEnd: number;
}): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded bg-zinc-950 p-3 font-mono text-xs">
      {props.lines.map((line, i) => {
        const lineNum = props.firstLineNumber + i;
        const isHighlight =
          lineNum >= props.highlightStart && lineNum <= props.highlightEnd;
        return (
          <div
            key={i}
            className={isHighlight ? 'bg-rose-500/10 text-zinc-100' : 'text-zinc-400'}
          >
            <span className="mr-3 inline-block w-10 select-none text-right text-zinc-600">
              {lineNum}
            </span>
            <span className="whitespace-pre">{line || ' '}</span>
          </div>
        );
      })}
    </div>
  );
}

function QuestionRow(props: {
  label: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; key: string }>;
}): React.ReactElement {
  return (
    <div>
      <div className="text-sm text-zinc-300">{props.label}</div>
      {props.help && <div className="text-xs text-zinc-500">{props.help}</div>}
      <div className="mt-2 flex flex-wrap gap-2">
        {props.options.map((opt) => {
          const selected = props.value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => props.onChange(opt.value)}
              className={`rounded border px-3 py-1.5 text-sm transition ${
                selected
                  ? 'border-white bg-white text-zinc-950'
                  : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {opt.label} <Kbd>{opt.key}</Kbd>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <kbd className="ml-1 rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-400">
      {children}
    </kbd>
  );
}
