import { NextRequest, NextResponse } from 'next/server';
import { runShoppingPipeline } from '../../../core/orchestrator';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const requestText = body.request || body.query;

    if (!requestText || typeof requestText !== 'string' || !requestText.trim()) {
      return NextResponse.json(
        { error: 'Valid purchase request string is required.' },
        { status: 400 }
      );
    }

    const result = await runShoppingPipeline(requestText.trim());
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Pipeline execution failed' },
      { status: 500 }
    );
  }
}
