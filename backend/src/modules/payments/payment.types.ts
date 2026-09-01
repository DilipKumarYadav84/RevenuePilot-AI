export type PaymentStatus =
  | "created"
  | "verification_pending"
  | "verified"
  | "verification_failed"
  | "cancelled";

export type PaymentRecord = {
  _id?: unknown;
  conversationId: string;
  offerId: string;
  productId: string;
  amount: number;
  currency: "INR";
  razorpayOrderId: string;
  razorpayPaymentId?: string | undefined;
  status: PaymentStatus;
  receipt: string;
  operationKey: string;
  verifiedAt?: Date | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
};

export type CreatePaymentOrderInput = {
  offerId: string;
  idempotencyKey?: string | undefined;
};

export type VerifyPaymentInput = {
  paymentRecordId: string;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type SafePaymentRecord = {
  id: string;
  conversationId: string;
  offerId: string;
  productId: string;
  amount: number;
  currency: "INR";
  razorpayOrderId: string;
  razorpayPaymentId?: string | undefined;
  status: PaymentStatus;
  receipt: string;
  verifiedAt?: Date | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
};

export type CreatePaymentOrderResult = {
  paymentRecordId: string;
  razorpayOrderId: string;
  amount: number;
  currency: "INR";
  keyId: string;
  receipt: string;
  status: PaymentStatus;
};
