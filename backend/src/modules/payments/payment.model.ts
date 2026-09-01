import { Schema, model, models, type Model } from "mongoose";

import type { PaymentRecord } from "./payment.types";

const paymentSchema = new Schema<PaymentRecord>(
  {
    conversationId: { type: String, required: true, trim: true, index: true },
    offerId: { type: String, required: true, trim: true, index: true },
    productId: { type: String, required: true, trim: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, enum: ["INR"], default: "INR" },
    razorpayOrderId: { type: String, required: true, trim: true, index: true },
    razorpayPaymentId: { type: String, trim: true },
    status: {
      type: String,
      required: true,
      enum: [
        "created",
        "verification_pending",
        "verified",
        "verification_failed",
        "cancelled",
      ],
      default: "created",
      index: true,
    },
    receipt: { type: String, required: true, trim: true, maxlength: 40 },
    operationKey: { type: String, required: true, trim: true, unique: true },
    verifiedAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

paymentSchema.index({ offerId: 1, status: 1 });
paymentSchema.index({ conversationId: 1, createdAt: -1 });

export const PaymentModel: Model<PaymentRecord> =
  models.Payment || model<PaymentRecord>("Payment", paymentSchema);
