import { apiRequest } from "./api-client";
import type {
  CreateOrderResponse,
  Offer,
  SafePaymentRecord,
  VerifyPaymentRequest,
} from "../types/payment";

export const getOffer = (offerId: string): Promise<Offer> =>
  apiRequest<Offer>(`/api/offers/${encodeURIComponent(offerId)}`);

export const createPaymentOrder = (
  offerId: string,
  idempotencyKey?: string,
): Promise<CreateOrderResponse> =>
  apiRequest<CreateOrderResponse>("/api/payments/create-order", {
    method: "POST",
    body: JSON.stringify({
      offerId,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    }),
  });

export const verifyPayment = (
  payload: VerifyPaymentRequest,
): Promise<SafePaymentRecord> =>
  apiRequest<SafePaymentRecord>("/api/payments/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getPayment = (
  paymentRecordId: string,
): Promise<SafePaymentRecord> =>
  apiRequest<SafePaymentRecord>(
    `/api/payments/${encodeURIComponent(paymentRecordId)}`,
  );
