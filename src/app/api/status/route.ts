import { NextResponse } from 'next/server';
import { getActivePolicy, getSpendHistory, isKillSwitchActive, getApprovals } from '../../../core/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const policy = getActivePolicy();
    const killSwitch = isKillSwitchActive();
    const spendHistory = getSpendHistory();
    const approvals = getApprovals('PENDING');

    const completedSpend = spendHistory.filter((s) => s.status === 'COMPLETED');
    const currentMonthlySpend = completedSpend.reduce((sum, s) => sum + s.amount, 0);

    return NextResponse.json({
      killSwitchActive: killSwitch,
      globalMonthlyCap: policy.globalMonthlyCap,
      autoApproveThreshold: policy.autoApproveThreshold,
      currentMonthlySpend: Number(currentMonthlySpend.toFixed(2)),
      remainingBudget: Number(Math.max(0, policy.globalMonthlyCap - currentMonthlySpend).toFixed(2)),
      pendingApprovalsCount: approvals.length,
      completedOrdersCount: completedSpend.length,
      policy,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
