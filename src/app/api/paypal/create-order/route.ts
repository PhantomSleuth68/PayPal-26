import { NextRequest, NextResponse } from 'next/server';
import { paypalProvider } from '../../../../providers/payment/paypal-provider';
import { saveOrderRecord, logAuditEvent } from '../../../../core/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { amount, description, referenceId, customId } = body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Valid positive amount is required' }, { status: 400 });
    }

    const ref = referenceId || `ref_${Date.now()}`;
    const desc = (description || 'Warden Purchase').slice(0, 127);

    const order = await paypalProvider.createOrder({
      amount,
      currency: 'USD',
      referenceId: ref,
      description: desc,
      customId,
    });

    saveOrderRecord({
      orderId: order.orderId,
      referenceId: ref,
      amount,
      currency: 'USD',
      status: order.status,
    });

    logAuditEvent({
      id: `audit_pp_create_${Date.now()}`,
      timestamp: new Date().toISOString(),
      eventType: 'PAYPAL_ORDER_CREATED',
      summary: `Created PayPal order ${order.orderId} for $${amount.toFixed(2)}`,
      details: { orderId: order.orderId, amount, status: order.status },
      decision: 'AUTO_APPROVE',
    });

    return NextResponse.json({
      orderId: order.orderId,
      status: order.status,
      approvalUrl: order.approvalUrl,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
