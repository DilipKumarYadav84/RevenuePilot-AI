import { Schema, model, models, type Model } from "mongoose";

import type { Offer } from "./offer.types";

const offerSchema = new Schema<Offer>(
  {
    conversationId: { type: String, required: true, trim: true, index: true },
    productId: { type: String, required: true, trim: true, index: true },
    actionType: {
      type: String,
      required: true,
      enum: ["CREATE_DISCOUNT"],
    },
    requestedDiscountPercent: { type: Number, required: true, min: 0, max: 100 },
    approvedDiscountPercent: { type: Number, required: true, min: 0, max: 100 },
    originalAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, required: true, min: 0 },
    finalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, enum: ["INR"], default: "INR" },
    amountUnit: { type: String, required: true, enum: ["paise"], default: "paise" },
    policyDecision: {
      type: String,
      required: true,
      enum: ["APPROVED", "MODIFIED", "BLOCKED", "REQUIRES_APPROVAL"],
    },
    status: {
      type: String,
      required: true,
      enum: ["created", "accepted", "rejected", "expired", "cancelled"],
      default: "created",
    },
    reason: { type: String, required: true, trim: true },
    expiresAt: { type: Date, required: true },
    executionKey: { type: String, required: true, unique: true, trim: true },
  },
  {
    timestamps: true,
  },
);

offerSchema.index({ conversationId: 1, createdAt: -1 });
offerSchema.index({ status: 1, expiresAt: 1 });

export const OfferModel: Model<Offer> =
  models.Offer || model<Offer>("Offer", offerSchema);
