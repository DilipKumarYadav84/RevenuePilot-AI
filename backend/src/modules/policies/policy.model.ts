import { Schema, model, models, type Model } from "mongoose";

import type {
  ActionProposal,
  ApprovedPolicyAction,
  MerchantPolicy,
  PolicyDecisionStatus,
} from "./policy.types";

const merchantPolicySchema = new Schema<MerchantPolicy>(
  {
    merchantKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: "technova",
    },
    maxDiscountPercent: { type: Number, required: true, min: 0, max: 100 },
    approvalThresholdPercent: { type: Number, required: true, min: 0, max: 100 },
    minimumOrderAmount: { type: Number, required: true, min: 0 },
    maximumOffersPerConversation: { type: Number, required: true, min: 0 },
    offerExpiryMinutes: { type: Number, required: true, min: 1 },
    allowDiscounts: { type: Boolean, required: true },
    allowBundles: { type: Boolean, required: true },
    allowAlternativeProducts: { type: Boolean, required: true },
    allowCheckout: { type: Boolean, required: true },
    active: { type: Boolean, required: true, default: true },
  },
  {
    timestamps: true,
  },
);

const actionProposalSchema = new Schema<ActionProposal>(
  {
    action: { type: String, required: true },
    conversationId: { type: String, trim: true },
    productId: { type: String, trim: true },
    orderValue: { type: Number, min: 0 },
    requestedDiscountPercent: { type: Number, min: 0, max: 100 },
    reason: { type: String, trim: true },
  },
  {
    _id: false,
  },
);

const approvedActionSchema = new Schema<ApprovedPolicyAction>(
  {
    action: { type: String, required: true },
    approvedDiscountPercent: { type: Number, min: 0, max: 100 },
  },
  {
    _id: false,
  },
);

type PolicyDecisionRecord = {
  merchantKey: string;
  conversationId?: string;
  productId?: string;
  action: ActionProposal;
  decision: PolicyDecisionStatus;
  approvedAction: ApprovedPolicyAction | null;
  reason: string;
  requiresHumanApproval: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

const policyDecisionSchema = new Schema<PolicyDecisionRecord>(
  {
    merchantKey: { type: String, required: true, trim: true },
    conversationId: { type: String, trim: true },
    productId: { type: String, trim: true },
    action: { type: actionProposalSchema, required: true },
    decision: {
      type: String,
      required: true,
      enum: ["APPROVED", "MODIFIED", "BLOCKED", "REQUIRES_APPROVAL"],
    },
    approvedAction: { type: approvedActionSchema, default: null },
    reason: { type: String, required: true, trim: true },
    requiresHumanApproval: { type: Boolean, required: true },
  },
  {
    timestamps: true,
  },
);

policyDecisionSchema.index({ merchantKey: 1, conversationId: 1, createdAt: -1 });
policyDecisionSchema.index({ decision: 1, "action.action": 1 });

export const MerchantPolicyModel: Model<MerchantPolicy> =
  models.MerchantPolicy ||
  model<MerchantPolicy>("MerchantPolicy", merchantPolicySchema);

export const PolicyDecisionModel: Model<PolicyDecisionRecord> =
  models.PolicyDecision ||
  model<PolicyDecisionRecord>("PolicyDecision", policyDecisionSchema);
