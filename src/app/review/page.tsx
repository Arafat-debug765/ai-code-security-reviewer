import Link from 'next/link';
import { listScans } from '@/lib/review-store';

export const dynamic = 'force-dynamic'; // always read fresh from disk

export default async function ReviewIndex(): Promise<React.ReactElement> {
  const scans = await listScans();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">Review scans</h1>
        <p className="mt-2 text-zinc-400">
          Judge each finding to build your evaluation dataset. Verdicts are
          saved to <code className="text-zinc-300">scan-results/judgments.csv</code>.
        </p>
      </header>

      {scans.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2">
          {scans.map((s) => {
            const progressPct =
              s.findingsCount === 0
                ? 0
                : Math.round((s.reviewedCount / s.findingsCount) * 100);
            const done = s.reviewedCount === s.findingsCount && s.findingsCount > 0;
            return (
              <li key={s.scanId}>
                <Link
                  href={`/review/${encodeURIComponent(s.scanId)}`}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 transition hover:border-zinc-700 hover:bg-zinc-900"
                >
                  <div>
                    <div className="font-medium text-zinc-100">{s.repo}</div>
                    <div className="text-sm text-zinc-500">
                      {new Date(s.scannedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    {s.findingsCount === 0 ? (
                      <span className="text-zinc-500">No findings</span>
                    ) : done ? (
                      <span className="text-emerald-400">
                        Reviewed {s.reviewedCount}/{s.findingsCount} ✓
                      </span>
                    ) : (
                      <span className="text-zinc-300">
                        {s.reviewedCount}/{s.findingsCount} ({progressPct}%)
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-center">
      <p className="text-zinc-300">No scans yet.</p>
      <p className="mt-2 text-sm text-zinc-500">
        Run a scan with JSON output to populate this page:
      </p>
      <pre className="mt-4 inline-block rounded bg-zinc-900 px-3 py-2 text-left text-xs text-zinc-300">
        npm run scan -- /path/to/repo --json &gt; scan-results/my-repo.json
      </pre>
    </div>
  );
}
