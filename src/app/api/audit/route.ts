import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogs } from '../../../core/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const runId = searchParams.get('runId') || undefined;
    const logs = getAuditLogs(limit, runId);
    return NextResponse.json({ logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
