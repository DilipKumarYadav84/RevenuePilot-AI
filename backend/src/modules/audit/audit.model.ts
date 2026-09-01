import { Schema, model, models, type Model } from "mongoose";

import type { AuditEvent } from "./audit.types";

const auditEventSchema = new Schema<AuditEvent>(
  {
    conversationId: { type: String, required: true, trim: true, index: true },
    sessionId: { type: String, trim: true },
    eventType: {
      type: String,
      required: true,
      enum: [
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
      ],
    },
    actor: {
      type: String,
      required: true,
      enum: [
        "customer",
        "assistant",
        "ai",
        "catalog",
        "policy_engine",
        "system",
        "merchant",
        "payment",
      ],
    },
    summary: { type: String, required: true, trim: true },
    reason: { type: String, trim: true },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
    operationKey: { type: String, trim: true, sparse: true, unique: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

auditEventSchema.index({ conversationId: 1, createdAt: 1 });
auditEventSchema.index({ eventType: 1, createdAt: -1 });
auditEventSchema.index({ actor: 1, createdAt: -1 });

export const AuditEventModel: Model<AuditEvent> =
  models.AuditEvent || model<AuditEvent>("AuditEvent", auditEventSchema);
