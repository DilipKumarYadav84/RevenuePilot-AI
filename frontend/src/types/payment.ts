export type PaymentStatus =
  | "created"
  | "verification_pending"
  | "verified"
  | "verification_failed"
  | "cancelled";

export type OfferStatus =
  | "created"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled";

export type Offer = {
  _id?: string;
  conversationId: string;
  productId: string;
  actionType: "CREATE_DISCOUNT";
  requestedDiscountPercent: number;
  approvedDiscountPercent: number;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  currency: "INR";
  amountUnit: "paise";
  policyDecision: "APPROVED" | "MODIFIED" | "BLOCKED" | "REQUIRES_APPROVAL";
  status: OfferStatus;
  reason: string;
  expiresAt: string;
  executionKey: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateOrderResponse = {
  paymentRecordId: string;
  razorpayOrderId: string;
  amount: number;
  currency: "INR";
  keyId: string;
  receipt: string;
  status: PaymentStatus;
};

export type VerifyPaymentRequest = {
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
  razorpayPaymentId?: string;
  status: PaymentStatus;
  receipt: string;
  verifiedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};
