import { PayPalProvider } from '../providers/payment/paypal-provider';
import { saveOrderRecord, recordSpend, logAuditEvent, getDb } from '../core/db';
import crypto from 'crypto';

async function run() {
  console.log('[PayPal Sandbox Check] Initializing PayPalProvider...');
  const provider = new PayPalProvider();

  // Test OAuth token generation
  try {
    const token = await provider.getAccessToken();
    console.log('[PayPal Sandbox Check] OAuth token acquired successfully. Length:', token.length);
  } catch (err: any) {
    console.error('[PayPal Sandbox Check] Failed to get OAuth token:', err.message);
    process.exit(1);
  }

  // Test Create $10 Order
  const idempotencyKey = `chk_${Date.now()}_${crypto.randomUUID()}`;
  console.log('[PayPal Sandbox Check] Creating $10 Order with idempotency key:', idempotencyKey);
  
  try {
    const order = await provider.createOrder({
      amount: 10.0,
      currency: 'USD',
      referenceId: `ref_check_${Date.now()}`,
      description: 'Warden $10 Sandbox Verification Item',
      idempotencyKey,
    });

    console.log('[PayPal Sandbox Check] Order Created Successfully!');
    console.log(' - Order ID:', order.orderId);
    console.log(' - Status:', order.status);
    console.log(' - Approval URL:', order.approvalUrl);

    // Save in DB
    saveOrderRecord({
      orderId: order.orderId,
      referenceId: `ref_check_${Date.now()}`,
      amount: 10.0,
      currency: 'USD',
      status: order.status,
      idempotencyKey,
    });
    console.log('[PayPal Sandbox Check] Saved to SQLite orders table.');

    logAuditEvent({
      id: `audit_paypal_chk_${Date.now()}`,
      timestamp: new Date().toISOString(),
      eventType: 'PAYPAL_ORDER_CREATED',
      summary: `Created $10 sandbox order ${order.orderId}`,
      details: { orderId: order.orderId, status: order.status, amount: 10.0 },
      decision: 'AUTO_APPROVE',
    });

    // Test capture
    console.log('[PayPal Sandbox Check] Attempting to capture order:', order.orderId);
    try {
      const capture = await provider.captureOrder({
        orderId: order.orderId,
        idempotencyKey: `cap_${idempotencyKey}`,
      });
      console.log('[PayPal Sandbox Check] Capture succeeded!');
      console.log(' - Capture ID:', capture.captureId);
      console.log(' - Capture Status:', capture.status);

      saveOrderRecord({
        orderId: order.orderId,
        referenceId: `ref_check_${Date.now()}`,
        amount: 10.0,
        currency: 'USD',
        status: capture.status,
        captureId: capture.captureId,
      });

      recordSpend({
        id: `spend_${Date.now()}`,
        orderId: order.orderId,
        captureId: capture.captureId,
        amount: 10.0,
        category: 'office supplies',
        timestamp: new Date().toISOString(),
        status: 'COMPLETED',
        proposalSummary: 'Warden $10 Sandbox Verification Item',
      });
    } catch (captureErr: any) {
      console.log('[PayPal Sandbox Check] Capture response:', captureErr.message);
      if (captureErr.message.includes('ORDER_NOT_APPROVED')) {
        console.log('[PayPal Sandbox Check] NOTE: In PayPal Orders v2, an order requires buyer approval before capture.');
        console.log('[PayPal Sandbox Check] In browser, the PayPal JS SDK popup completes buyer approval.');
      }
    }
  } catch (err: any) {
    console.error('[PayPal Sandbox Check] Order creation error:', err.message);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});

