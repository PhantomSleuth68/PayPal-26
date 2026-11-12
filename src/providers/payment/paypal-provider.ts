import {
  CaptureOrderParams,
  CaptureResult,
  CreateOrderParams,
  OrderResult,
  PaymentProvider,
} from './types';
import crypto from 'crypto';

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

export class PayPalProvider implements PaymentProvider {
  public readonly name = 'PayPal Sandbox Orders v2';

  private getBaseUrl(): string {
    const env = process.env.PAYPAL_ENV || 'sandbox';
    return env.toLowerCase() === 'live' || env.toLowerCase() === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  private getCredentials(): { clientId: string; clientSecret: string } {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'Missing PayPal credentials: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in .env'
      );
    }
    return { clientId, clientSecret };
  }

  public async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt > now + 60000) {
      return cachedToken.token;
    }

    const { clientId, clientSecret } = this.getCredentials();
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const url = `${this.getBaseUrl()}/v1/oauth2/token`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en_US',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`PayPal OAuth failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const expiresInMs = (data.expires_in || 3600) * 1000;
    cachedToken = {
      token: data.access_token,
      expiresAt: now + expiresInMs,
    };

    return cachedToken.token;
  }

  public async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    const token = await this.getAccessToken();
    const idempotencyKey = params.idempotencyKey || `ord_${crypto.randomUUID()}`;
    const url = `${this.getBaseUrl()}/v2/checkout/orders`;

    const body: Record<string, unknown> = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: params.referenceId.slice(0, 255),
          description: params.description.slice(0, 127),
          custom_id: params.customId ? params.customId.slice(0, 127) : undefined,
          amount: {
            currency_code: params.currency || 'USD',
            value: params.amount.toFixed(2),
          },
        },
      ],
    };

    // If sandboxAutoPay is requested in Sandbox mode, pass standard test card for immediate completed capture
    if (params.sandboxAutoPay && (process.env.PAYPAL_ENV || 'sandbox') !== 'live') {
      body.payment_source = {
        card: {
          name: 'Allowance Sandbox Tester',
          number: '4111111111111111',
          expiry: '2028-12',
          security_code: '123',
        },
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'PayPal-Request-Id': idempotencyKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`PayPal Create Order failed (${response.status}): ${JSON.stringify(data)}`);
    }

    const approveLink = data.links?.find((l: { rel: string; href: string }) => l.rel === 'approve');
    const directCaptureId =
      data.purchase_units?.[0]?.payments?.captures?.[0]?.id || undefined;

    return {
      orderId: data.id,
      status: data.status,
      approvalUrl: approveLink ? approveLink.href : undefined,
      captureId: directCaptureId,
      rawResponse: data,
    };
  }

  public async captureOrder(params: CaptureOrderParams): Promise<CaptureResult> {
    const token = await this.getAccessToken();
    const idempotencyKey = params.idempotencyKey || `cap_${crypto.randomUUID()}`;
    const url = `${this.getBaseUrl()}/v2/checkout/orders/${encodeURIComponent(params.orderId)}/capture`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'PayPal-Request-Id': idempotencyKey,
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();
    if (!response.ok) {
      const errMessage =
        data.details?.[0]?.description ||
        data.message ||
        `PayPal Capture failed with status ${response.status}`;
      const err = new Error(errMessage);
      (err as any).paypalData = data;
      (err as any).statusCode = response.status;
      throw err;
    }

    const captureUnit = data.purchase_units?.[0]?.payments?.captures?.[0];
    const captureId = captureUnit?.id || data.id;
    const amountVal = parseFloat(captureUnit?.amount?.value || '0');
    const currency = captureUnit?.amount?.currency_code || 'USD';

    return {
      captureId,
      orderId: data.id,
      status: data.status,
      amount: amountVal,
      currency,
      payer: data.payer
        ? {
            email: data.payer.email_address,
            payerId: data.payer.payer_id,
            name: data.payer.name?.given_name
              ? `${data.payer.name.given_name} ${data.payer.name.surname || ''}`.trim()
              : undefined,
          }
        : undefined,
      rawResponse: data,
    };
  }

  public async getOrder(orderId: string): Promise<unknown> {
    const token = await this.getAccessToken();
    const url = `${this.getBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`PayPal Get Order failed (${response.status}): ${errText}`);
    }

    return await response.json();
  }
}

export const paypalProvider = new PayPalProvider();

