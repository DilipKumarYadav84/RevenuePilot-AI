import { Types } from "mongoose";
import { z } from "zod";

export const auditEventTypeSchema = z.enum([
  "CONVERSATION_STARTED",
  "CUSTOMER_MESSAGE_RECEIVED",
  "ASSISTANT_MESSAGE_CREATED",
  "INTENT_DETECTED",
  "CUSTOMER_STATE_UPDATED",
  "CATALOG_SEARCHED",
  "PRODUCT_RECOMMENDED",
  "ACTION_PROPOSED",
  "POLICY_APPROVED",
  "POLICY_MODIFIED",
  "POLICY_BLOCKED",
  "POLICY_REQUIRES_APPROVAL",
  "OFFER_CREATED",
  "OFFER_ACCEPTED",
  "OFFER_REJECTED",
  "OFFER_EXPIRED",
  "RAZORPAY_ORDER_CREATED",
  "PAYMENT_VERIFICATION_SUCCEEDED",
  "PAYMENT_VERIFICATION_FAILED",
]);

export const auditActorSchema = z.enum([
  "customer",
  "assistant",
  "ai",
  "catalog",
  "policy_engine",
  "system",
  "merchant",
  "payment",
]);

export const mongoIdSchema = z
  .string()
  .trim()
  .refine((value) => Types.ObjectId.isValid(value), {
    message: "Invalid MongoDB ObjectId",
  });

export const auditQuerySchema = z
  .object({
    conversationId: mongoIdSchema.optional(),
    eventType: auditEventTypeSchema.optional(),
    actor: auditActorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    page: z.coerce.number().int().min(1).default(1),
  })
  .strict();
