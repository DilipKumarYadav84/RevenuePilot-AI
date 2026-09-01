import type { CreateOrderResponse } from "./payment";

export type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type RazorpayFailureResponse = {
  error?: {
    code?: string;
    description?: string;
    source?: string;
    step?: string;
    reason?: string;
    metadata?: {
      order_id?: string;
      payment_id?: string;
    };
  };
};

export type RazorpayOptions = {
  key: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  order_id: string;
  image?: string;
  handler: (response: RazorpaySuccessResponse) => void;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
};

export type RazorpayInstance = {
  open: () => void;
  on: (
    event: "payment.failed",
    handler: (response: RazorpayFailureResponse) => void,
  ) => void;
};

export type RazorpayConstructor = new (
  options: RazorpayOptions,
) => RazorpayInstance;

export type CheckoutOrder = Pick<
  CreateOrderResponse,
  "paymentRecordId" | "razorpayOrderId" | "amount" | "currency" | "keyId"
>;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}
