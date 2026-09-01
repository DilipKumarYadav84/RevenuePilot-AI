import { Types } from "mongoose";
import { z } from "zod";

export const mongoIdSchema = z
  .string()
  .trim()
  .refine((value) => Types.ObjectId.isValid(value), {
    message: "Invalid MongoDB ObjectId",
  });

export const createOfferSchema = z
  .object({
    action: z.literal("CREATE_DISCOUNT"),
    conversationId: mongoIdSchema,
    productId: mongoIdSchema,
    requestedDiscountPercent: z.number().min(0).max(100),
    idempotencyKey: z.string().trim().min(8).max(160).optional(),
  })
  .strict();
