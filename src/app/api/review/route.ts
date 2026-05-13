import { NextRequest, NextResponse } from 'next/server';
import { saveJudgment, type Judgment } from '@/lib/review-store';
import { z } from 'zod';

export const runtime = 'nodejs';

const JudgmentSchema = z.object({
  scanId: z.string().min(1).max(200),
  findingIndex: z.number().int().nonnegative(),
  verdict: z.enum(['true_positive', 'false_positive', 'unsure']),
  wouldRecommendOnPr: z.enum(['yes', 'no']),
  fixQuality: z.enum(['correct', 'partial', 'wrong', 'na']),
  notes: z.string().max(2000),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = JudgmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const judgment: Judgment = {
    ...parsed.data,
    judgedAt: new Date().toISOString(),
  };

  await saveJudgment(judgment);
  return NextResponse.json({ ok: true, judgment });
}
