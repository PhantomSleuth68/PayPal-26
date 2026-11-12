import { NextRequest, NextResponse } from 'next/server';
import {
  getApprovals,
  updateApprovalStatus,
  logAuditEvent,
  recordSpend,
  saveOrderRecord,
} from '../../../core/db';
import { paypalProvider } from '../../../providers/payment/paypal-provider';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as 'PENDING' | 'APPROVED' | 'REJECTED' | null;
    const approvals = getApprovals(status || undefined);
    return NextResponse.json({ approvals });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { approvalId, action } = body;

    if (!approvalId || !action || !['APPROVE', 'REJECT'].includes(action)) {
      return NextResponse.json(
        { error: 'approvalId and action (APPROVE | REJECT) are required' },
        { status: 400 }
      );
    }

    const approvals = getApprovals();
    const target = approvals.find((a) => a.id === approvalId);

    if (!target) {
      return NextResponse.json({ error: 'Approval request not found' }, { status: 404 });
    }

    if (target.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Approval is already resolved with status ${target.status}` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    if (action === 'REJECT') {
      updateApprovalStatus(approvalId, 'REJECTED');

      logAuditEvent({
        id: `audit_rej_${Date.now()}`,
        timestamp: now,
        eventType: 'APPROVAL_REJECTED',
        summary: `Human operator REJECTED purchase proposal for "${target.proposal.items[0]?.title}" ($${target.proposal.total.toFixed(2)})`,
        details: { approvalId, proposal: target.proposal },
        decision: 'BLOCK',
      });

      return NextResponse.json({
        success: true,
        status: 'REJECTED',
        message: 'Purchase request rejected by human operator.',
      });
    }

    // Action === 'APPROVE': Proceed to PayPal Sandbox payment!
    let orderId = target.paypalOrderId;
    let captureId: string | undefined;

    if (!orderId) {
      const order = await paypalProvider.createOrder({
        amount: target.proposal.total,
        currency: 'USD',
        referenceId: `appr_paid_${approvalId}`,
        description: `Warden Approved: ${target.proposal.items[0]?.title}`.slice(0, 127),
      });
      orderId = order.orderId;
    }

    // Attempt capture in sandbox
    try {
      const capture = await paypalProvider.captureOrder({ orderId });
      captureId = capture.captureId;

      saveOrderRecord({
        orderId,
        referenceId: `appr_paid_${approvalId}`,
        amount: target.proposal.total,
        currency: 'USD',
        status: capture.status,
        captureId: capture.captureId,
        proposal: target.proposal,
      });

      recordSpend({
        id: `spend_${Date.now()}`,
        orderId,
        captureId,
        amount: target.proposal.total,
        category: target.proposal.category,
        timestamp: now,
        status: 'COMPLETED',
        proposalSummary: target.proposal.items[0]?.title,
      });

      logAuditEvent({
        id: `audit_hum_appr_${Date.now()}`,
        timestamp: now,
        eventType: 'HUMAN_APPROVAL',
        summary: `Human operator APPROVED and paid $${target.proposal.total.toFixed(2)} for "${target.proposal.items[0]?.title}". PayPal Capture ID: ${captureId}`,
        details: { approvalId, orderId, captureId, proposal: target.proposal },
        decision: 'AUTO_APPROVE',
      });
    } catch (captureErr: any) {
      // Order created in sandbox, awaiting buyer popup approval
      saveOrderRecord({
        orderId,
        referenceId: `appr_paid_${approvalId}`,
        amount: target.proposal.total,
        currency: 'USD',
        status: 'CREATED',
        proposal: target.proposal,
      });

      logAuditEvent({
        id: `audit_hum_appr_${Date.now()}`,
        timestamp: now,
        eventType: 'HUMAN_APPROVAL',
        summary: `Human operator APPROVED purchase for "${target.proposal.items[0]?.title}". PayPal Sandbox Order ${orderId} created, awaiting buyer authorization popup.`,
        details: { approvalId, orderId, proposal: target.proposal },
        decision: 'AUTO_APPROVE',
      });
    }

    updateApprovalStatus(approvalId, 'APPROVED', captureId);

    return NextResponse.json({
      success: true,
      status: 'APPROVED',
      orderId,
      captureId,
      message: captureId
        ? `Order successfully paid in PayPal Sandbox! Capture ID: ${captureId}`
        : `Order approved! PayPal Sandbox Order ID: ${orderId}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
