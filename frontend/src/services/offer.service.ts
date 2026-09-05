import { apiRequest } from "./api-client";
import type { CreateOfferResult } from "../types/conversation";
import type { Offer } from "../types/payment";

export const createOffer = (input: {
  conversationId: string;
  productId: string;
  requestedDiscountPercent: number;
  idempotencyKey?: string;
}): Promise<CreateOfferResult> =>
  apiRequest<CreateOfferResult>("/api/offers", {
    method: "POST",
    body: JSON.stringify({
      action: "CREATE_DISCOUNT",
      conversationId: input.conversationId,
      productId: input.productId,
      requestedDiscountPercent: input.requestedDiscountPercent,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    }),
  });

export const createCheckoutOffer = (input: {
  conversationId: string;
  productId: string;
  idempotencyKey?: string;
}): Promise<CreateOfferResult> =>
  apiRequest<CreateOfferResult>("/api/offers/checkout", {
    method: "POST",
    body: JSON.stringify({
      action: "START_CHECKOUT",
      conversationId: input.conversationId,
      productId: input.productId,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    }),
  });

export const acceptOffer = (offerId: string): Promise<{
  offer: Offer;
  finalPayableAmount: number;
  amountUnit: "paise";
  currency: "INR";
}> =>
  apiRequest(`/api/offers/${encodeURIComponent(offerId)}/accept`, {
    method: "POST",
  });
