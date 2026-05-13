import { NextRequest, NextResponse } from 'next/server';
import { loadScan, readSourceContext } from '@/lib/review-store';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ scanId: string }>;
}

export async function GET(
  _req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { scanId } = await context.params;
  const scan = await loadScan(scanId);
  if (!scan) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  }

  // Eagerly fetch source context for each finding so the UI doesn't have
  // to make N round-trips. For 50+ findings we'd switch to lazy loading,
  // but for typical scans this is fine.
  const findingsWithContext = await Promise.all(
    scan.findings.map(async (f) => ({
      ...f,
      sourceContext: await readSourceContext(f.filePath, f.startLine, f.endLine),
    })),
  );

  return NextResponse.json({
    scanId: scan.scanId,
    repo: scan.repo,
    stats: scan.result.stats,
    findings: findingsWithContext,
  });
}
