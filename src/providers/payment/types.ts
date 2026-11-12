export interface CreateOrderParams {
  amount: number;
  currency?: string;
  referenceId: string;
  description: string;
  customId?: string;
  idempotencyKey?: string;
  sandboxAutoPay?: boolean;
}

export interface OrderResult {
  orderId: string;
  status: string;
  approvalUrl?: string;
  captureId?: string;
  rawResponse?: unknown;
}

export interface CaptureOrderParams {
  orderId: string;
  idempotencyKey?: string;
}

export interface CaptureResult {
  captureId: string;
  orderId: string;
  status: string;
  amount: number;
  currency: string;
  payer?: {
    email?: string;
    payerId?: string;
    name?: string;
  };
  rawResponse?: unknown;
}

export interface PaymentProvider {
  name: string;
  createOrder(params: CreateOrderParams): Promise<OrderResult>;
  captureOrder(params: CaptureOrderParams): Promise<CaptureResult>;
  getOrder(orderId: string): Promise<unknown>;
}

