import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogs } from '../../../core/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const logs = getAuditLogs(limit);
    return NextResponse.json({ logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
