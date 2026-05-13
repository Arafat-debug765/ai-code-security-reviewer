import { NextResponse } from 'next/server';
import { listScans } from '@/lib/review-store';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const scans = await listScans();
  return NextResponse.json({ scans });
}
