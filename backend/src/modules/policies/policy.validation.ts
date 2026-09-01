import { Types } from "mongoose";
import { z } from "zod";

export const policyActionSchema = z.enum([
  "CREATE_DISCOUNT",
  "CREATE_BUNDLE",
  "RECOMMEND_ALTERNATIVE",
  "START_CHECKOUT",
  "EXPLAIN_VALUE",
  "NO_ACTION",
]);

export const mongoIdSchema = z
  .string()
  .trim()
  .refine((value) => Types.ObjectId.isValid(value), {
    message: "Invalid MongoDB ObjectId",
  });

const percentSchema = z.number().min(0).max(100);

export const actionProposalSchema = z
  .object({
    action: policyActionSchema,
    conversationId: mongoIdSchema.optional(),
    productId: mongoIdSchema.optional(),
    orderValue: z.number().positive().optional(),
    requestedDiscountPercent: percentSchema.optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const merchantPolicyUpdateSchema = z
  .object({
    maxDiscountPercent: percentSchema.optional(),
    approvalThresholdPercent: percentSchema.optional(),
    minimumOrderAmount: z.number().min(0).optional(),
    maximumOffersPerConversation: z.number().int().min(0).optional(),
    offerExpiryMinutes: z.number().int().min(1).optional(),
    allowDiscounts: z.boolean().optional(),
    allowBundles: z.boolean().optional(),
    allowAlternativeProducts: z.boolean().optional(),
    allowCheckout: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.maxDiscountPercent === undefined ||
      value.approvalThresholdPercent === undefined ||
      // Strict inequality: if approvalThresholdPercent === maxDiscountPercent,
      // evaluateDiscount()'s MODIFIED branch (requestedDiscountPercent >
      // maxDiscountPercent) always fires before REQUIRES_APPROVAL can ever
      // be reached, silently disabling the human-approval tier. See
      // policy.engine.ts.
      value.approvalThresholdPercent < value.maxDiscountPercent,
    {
      message: "approvalThresholdPercent must be strictly less than maxDiscountPercent",
    },
  );
