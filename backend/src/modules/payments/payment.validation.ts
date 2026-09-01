import { Types } from "mongoose";
import { z } from "zod";

export const mongoIdSchema = z
  .string()
  .trim()
  .refine((value) => Types.ObjectId.isValid(value), {
    message: "Invalid MongoDB ObjectId",
  });

export const createPaymentOrderSchema = z
  .object({
    offerId: mongoIdSchema,
    idempotencyKey: z.string().trim().min(8).max(160).optional(),
  })
  .strict();

export const verifyPaymentSchema = z
  .object({
    paymentRecordId: mongoIdSchema,
    razorpay_payment_id: z.string().trim().min(6).max(120),
    razorpay_order_id: z.string().trim().min(6).max(120),
    razorpay_signature: z.string().trim().min(20).max(256),
  })
  .strict();
