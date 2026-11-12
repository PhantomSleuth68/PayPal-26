import { NextRequest, NextResponse } from 'next/server';
import { isKillSwitchActive, setKillSwitchActive } from '../../../core/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const active = isKillSwitchActive();
    return NextResponse.json({ killSwitchActive: active });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { active, reason } = body;

    if (typeof active !== 'boolean') {
      return NextResponse.json(
        { error: 'Field "active" (boolean) is required' },
        { status: 400 }
      );
    }

    setKillSwitchActive(active, reason || 'Operator UI Action');
    return NextResponse.json({
      success: true,
      killSwitchActive: active,
      message: active
        ? 'Agent permissions REVOKED. All purchase actions are now strictly blocked.'
        : 'Kill switch disengaged. Agent shopping permissions restored.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
