import { NextRequest, NextResponse } from 'next/server';
import { paypalProvider } from '../../../../providers/payment/paypal-provider';
import {
  saveOrderRecord,
  recordSpend,
  logAuditEvent,
  updateApprovalStatus,
  getApprovals,
} from '../../../../core/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, approvalId, proposalSummary, category } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const capture = await paypalProvider.captureOrder({ orderId });
    const now = new Date().toISOString();

    saveOrderRecord({
      orderId,
      referenceId: `cap_ref_${Date.now()}`,
      amount: capture.amount,
      currency: capture.currency,
      status: capture.status,
      captureId: capture.captureId,
    });

    recordSpend({
      id: `spend_${Date.now()}`,
      orderId,
      captureId: capture.captureId,
      amount: capture.amount,
      category: category || 'office supplies',
      timestamp: now,
      status: 'COMPLETED',
      proposalSummary: proposalSummary || 'PayPal Sandbox Order Captured',
    });

    if (approvalId) {
      updateApprovalStatus(approvalId, 'APPROVED', capture.captureId);
    }

    logAuditEvent({
      id: `audit_cap_${Date.now()}`,
      timestamp: now,
      eventType: 'PAYPAL_ORDER_CAPTURED',
      summary: `PayPal capture ${capture.captureId} successful for $${capture.amount.toFixed(2)}`,
      details: { orderId, captureId: capture.captureId, amount: capture.amount },
      decision: 'AUTO_APPROVE',
    });

    return NextResponse.json({
      success: true,
      captureId: capture.captureId,
      status: capture.status,
      amount: capture.amount,
      currency: capture.currency,
      payer: capture.payer,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
