import type { PolicyDecisionStatus } from "../policies/policy.types";

export type OfferActionType = "CREATE_DISCOUNT";

export type OfferStatus =
  | "created"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled";

export type Offer = {
  conversationId: string;
  productId: string;
  actionType: OfferActionType;
  requestedDiscountPercent: number;
  approvedDiscountPercent: number;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  currency: "INR";
  amountUnit: "paise";
  policyDecision: PolicyDecisionStatus;
  status: OfferStatus;
  reason: string;
  expiresAt: Date;
  executionKey: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type CreateOfferInput = {
  action: OfferActionType;
  conversationId: string;
  productId: string;
  requestedDiscountPercent: number;
  idempotencyKey?: string | undefined;
};
