import { describe, it, expect } from 'vitest';
import { PayPalProvider } from '../providers/payment/paypal-provider';
import { saveOrderRecord, getDb } from '../core/db';
import crypto from 'crypto';

describe('PayPal Gateway - Sandbox Orders v2', () => {
  it('connects to PayPal Sandbox, creates a $10 order and stores in SQLite', async () => {
    // If credentials are not present, skip
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      console.warn('Skipping live sandbox check: credentials not found in env');
      return;
    }

    const provider = new PayPalProvider();
    let token: string;
    try {
      token = await provider.getAccessToken();
    } catch (e: any) {
      if (
        e.message?.includes('fetch failed') ||
        e.message?.includes('ENOTFOUND') ||
        e.cause?.code === 'ENOTFOUND'
      ) {
        console.warn('Network unreachable in sandbox mode; skipping live PayPal API call.');
        return;
      }
      throw e;
    }
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);

    const idempotencyKey = `ord_test_${Date.now()}_${crypto.randomUUID()}`;
    const order = await provider.createOrder({
      amount: 10.0,
      currency: 'USD',
      referenceId: `ref_unit_${Date.now()}`,
      description: 'Allowance $10 Sandbox Test Item',
      idempotencyKey,
    });

    expect(order.orderId).toBeDefined();
    expect(order.status).toBe('CREATED');
    expect(order.approvalUrl).toBeDefined();

    // Verify DB persistence
    saveOrderRecord({
      orderId: order.orderId,
      referenceId: `ref_unit_${Date.now()}`,
      amount: 10.0,
      currency: 'USD',
      status: order.status,
      idempotencyKey,
    });

    const db = getDb();
    const row = db
      .prepare('SELECT * FROM orders WHERE order_id = ?')
      .get(order.orderId) as any;

    expect(row).toBeDefined();
    expect(row.order_id).toBe(order.orderId);
    expect(row.amount).toBe(10.0);
    expect(row.status).toBe('CREATED');
  });
});
