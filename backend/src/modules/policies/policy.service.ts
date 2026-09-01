import {
  MerchantPolicyModel,
  PolicyDecisionModel,
} from "./policy.model";
import { OfferModel } from "../offers/offer.model";
import {
  createAuditEvent,
  policyDecisionToAuditEventType,
} from "../audit/audit.service";
import { evaluatePolicy, shouldCountAsCompletedOffer } from "./policy.engine";
import type {
  ActionProposal,
  MerchantPolicy,
  PolicyDecision,
} from "./policy.types";

const DEFAULT_MERCHANT_KEY = "technova";
export const EXECUTABLE_OFFER_STATUSES = ["created", "accepted"] as const;

type ExecutableOfferCountQuery = {
  conversationId: string;
  actionType: "CREATE_DISCOUNT";
  status: {
    $in: typeof EXECUTABLE_OFFER_STATUSES;
  };
};

export const defaultMerchantPolicy: MerchantPolicy = {
  merchantKey: DEFAULT_MERCHANT_KEY,
  maxDiscountPercent: 10,
  approvalThresholdPercent: 8,
  minimumOrderAmount: 1000,
  maximumOffersPerConversation: 1,
  offerExpiryMinutes: 10,
  allowDiscounts: true,
  allowBundles: true,
  allowAlternativeProducts: true,
  allowCheckout: true,
  active: true,
};

export const getActiveMerchantPolicy = async (): Promise<MerchantPolicy> => {
  const policy = await MerchantPolicyModel.findOne({
    merchantKey: DEFAULT_MERCHANT_KEY,
    active: true,
  })
    .lean<MerchantPolicy>()
    .exec();

  if (policy) {
    return policy;
  }

  const createdPolicy = await MerchantPolicyModel.findOneAndUpdate(
    { merchantKey: DEFAULT_MERCHANT_KEY },
    { $setOnInsert: defaultMerchantPolicy },
    {
      upsert: true,
      returnDocument: "after",
      runValidators: true,
    },
  )
    .lean<MerchantPolicy>()
    .exec();

  return createdPolicy ?? defaultMerchantPolicy;
};

export type MerchantPolicyUpdates = {
  maxDiscountPercent?: number | undefined;
  approvalThresholdPercent?: number | undefined;
  minimumOrderAmount?: number | undefined;
  maximumOffersPerConversation?: number | undefined;
  offerExpiryMinutes?: number | undefined;
  allowDiscounts?: boolean | undefined;
  allowBundles?: boolean | undefined;
  allowAlternativeProducts?: boolean | undefined;
  allowCheckout?: boolean | undefined;
  active?: boolean | undefined;
};

export class PolicyUpdateValidationError extends Error {
  statusCode = 400;
}

/**
 * Pure merge + validation step for a merchant policy update, kept
 * standalone (no DB access) so it is directly unit-testable. Merges the
 * update onto the existing policy and enforces business invariants against
 * the fully-merged result — not just fields present together in a single
 * request — so e.g. a PATCH that only raises approvalThresholdPercent to
 * meet the existing maxDiscountPercent is caught too.
 */
export const computeUpdatedMerchantPolicy = (
  existingPolicy: MerchantPolicy,
  updates: MerchantPolicyUpdates,
): MerchantPolicy => {
  // Filter out explicit `undefined` values before merging so a partial
  // update never clobbers an existing field, and so the merge type-checks
  // cleanly against MerchantPolicy under exactOptionalPropertyTypes.
  const definedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  ) as Partial<MerchantPolicy>;

  const nextPolicy: MerchantPolicy = {
    ...existingPolicy,
    ...definedUpdates,
    merchantKey: DEFAULT_MERCHANT_KEY,
  };
  const approvalThresholdPercent =
    nextPolicy.approvalThresholdPercent ?? existingPolicy.approvalThresholdPercent;
  const maxDiscountPercent =
    nextPolicy.maxDiscountPercent ?? existingPolicy.maxDiscountPercent;

  // Strict inequality: if approvalThresholdPercent === maxDiscountPercent,
  // evaluateDiscount()'s MODIFIED branch (requestedDiscountPercent >
  // maxDiscountPercent) always fires before REQUIRES_APPROVAL can ever be
  // reached, silently disabling the human-approval tier. See
  // policy.engine.ts.
  if (approvalThresholdPercent >= maxDiscountPercent) {
    throw new PolicyUpdateValidationError(
      "approvalThresholdPercent must be strictly less than maxDiscountPercent",
    );
  }

  return nextPolicy;
};

export const updateMerchantPolicy = async (
  updates: MerchantPolicyUpdates,
): Promise<MerchantPolicy> => {
  const existingPolicy = await getActiveMerchantPolicy();
  const nextPolicy = computeUpdatedMerchantPolicy(existingPolicy, updates);

  const updatedPolicy = await MerchantPolicyModel.findOneAndUpdate(
    { merchantKey: DEFAULT_MERCHANT_KEY },
    { $set: nextPolicy },
    {
      upsert: true,
      returnDocument: "after",
      runValidators: true,
    },
  )
    .lean<MerchantPolicy>()
    .exec();

  return updatedPolicy ?? nextPolicy;
};

const countCompletedOffers = async (
  conversationId: string | undefined,
): Promise<number> => {
  if (!conversationId) {
    return 0;
  }

  return OfferModel.countDocuments(
    buildExecutableOfferCountQuery(conversationId),
  ).exec();
};

export const buildExecutableOfferCountQuery = (
  conversationId: string,
): ExecutableOfferCountQuery => ({
  conversationId,
  actionType: "CREATE_DISCOUNT",
  status: { $in: EXECUTABLE_OFFER_STATUSES },
});

export const evaluateActionProposal = async (
  proposal: ActionProposal,
): Promise<PolicyDecision> => {
  const policy = await getActiveMerchantPolicy();
  const completedOffersForConversation = await countCompletedOffers(
    proposal.conversationId,
  );
  const decision = evaluatePolicy({
    proposal,
    policy,
    completedOffersForConversation,
  });
  const decisionRecord = {
    merchantKey: policy.merchantKey,
    action: proposal,
    decision: decision.decision,
    approvedAction: decision.approvedAction,
    reason: decision.reason,
    requiresHumanApproval: decision.requiresHumanApproval,
  };

  if (proposal.conversationId) {
    Object.assign(decisionRecord, { conversationId: proposal.conversationId });
  }

  if (proposal.productId) {
    Object.assign(decisionRecord, { productId: proposal.productId });
  }

  await PolicyDecisionModel.create(decisionRecord);

  if (proposal.conversationId) {
    await createAuditEvent({
      conversationId: proposal.conversationId,
      eventType: policyDecisionToAuditEventType(decision.decision),
      actor: "policy_engine",
      summary: `${proposal.action} policy decision: ${decision.decision}.`,
      reason: decision.reason,
      input: {
        action: proposal.action,
        productId: proposal.productId,
        orderValue: proposal.orderValue,
        requestedDiscountPercent: proposal.requestedDiscountPercent,
      },
      output: {
        decision: decision.decision,
        approvedAction: decision.approvedAction,
        requiresHumanApproval: decision.requiresHumanApproval,
      },
      metadata: {
        merchantKey: policy.merchantKey,
        maxDiscountPercent: policy.maxDiscountPercent,
        approvalThresholdPercent: policy.approvalThresholdPercent,
        minimumOrderAmount: policy.minimumOrderAmount,
        completedOffersForConversation,
      },
      operationKey: `policy:${proposal.conversationId}:${proposal.action}:${proposal.productId ?? "none"}:${
        proposal.requestedDiscountPercent ?? "none"
      }:${decision.decision}`,
    });
  }

  return decision;
};

export const decisionConsumesOffer = shouldCountAsCompletedOffer;
