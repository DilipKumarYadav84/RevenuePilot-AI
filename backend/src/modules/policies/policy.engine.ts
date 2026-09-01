import type {
  ActionProposal,
  MerchantPolicy,
  PolicyDecision,
  PolicyEvaluationInput,
} from "./policy.types";

const blocked = (
  requestedAction: ActionProposal,
  reason: string,
): PolicyDecision => ({
  decision: "BLOCKED",
  requestedAction,
  approvedAction: null,
  reason,
  requiresHumanApproval: false,
});

const approved = (
  requestedAction: ActionProposal,
  reason: string,
  approvedDiscountPercent?: number,
): PolicyDecision => ({
  decision: "APPROVED",
  requestedAction,
  approvedAction:
    approvedDiscountPercent === undefined
      ? { action: requestedAction.action }
      : {
          action: requestedAction.action,
          approvedDiscountPercent,
        },
  reason,
  requiresHumanApproval: false,
});

const requiresApproval = (
  requestedAction: ActionProposal,
  reason: string,
): PolicyDecision => ({
  decision: "REQUIRES_APPROVAL",
  requestedAction,
  approvedAction: null,
  reason,
  requiresHumanApproval: true,
});

const modified = (
  requestedAction: ActionProposal,
  reason: string,
  approvedDiscountPercent: number,
): PolicyDecision => ({
  decision: "MODIFIED",
  requestedAction,
  approvedAction: {
    action: requestedAction.action,
    approvedDiscountPercent,
  },
  reason,
  requiresHumanApproval: false,
});

const evaluateDiscount = ({
  proposal,
  policy,
  completedOffersForConversation,
}: PolicyEvaluationInput): PolicyDecision => {
  if (!policy.allowDiscounts) {
    return blocked(proposal, "Merchant policy does not allow discounts.");
  }

  if (proposal.orderValue === undefined) {
    return blocked(proposal, "orderValue is required for discount evaluation.");
  }

  if (proposal.orderValue < policy.minimumOrderAmount) {
    return blocked(
      proposal,
      `Order value must be at least ${policy.minimumOrderAmount} to receive a discount.`,
    );
  }

  if (completedOffersForConversation >= policy.maximumOffersPerConversation) {
    return blocked(
      proposal,
      `Merchant policy allows only ${policy.maximumOffersPerConversation} completed offer(s) per conversation.`,
    );
  }

  if (proposal.requestedDiscountPercent === undefined) {
    return blocked(
      proposal,
      "requestedDiscountPercent is required for discount evaluation.",
    );
  }

  if (proposal.requestedDiscountPercent > policy.maxDiscountPercent) {
    return modified(
      proposal,
      `Merchant policy limits discounts to ${policy.maxDiscountPercent}%.`,
      policy.maxDiscountPercent,
    );
  }

  if (proposal.requestedDiscountPercent > policy.approvalThresholdPercent) {
    return requiresApproval(
      proposal,
      `Discounts above ${policy.approvalThresholdPercent}% require human approval.`,
    );
  }

  return approved(
    proposal,
    "Discount is within merchant policy limits.",
    proposal.requestedDiscountPercent,
  );
};

export const evaluatePolicy = (
  input: PolicyEvaluationInput,
): PolicyDecision => {
  const { proposal, policy } = input;

  if (!policy.active) {
    return blocked(proposal, "Merchant policy is inactive.");
  }

  switch (proposal.action) {
    case "CREATE_DISCOUNT":
      return evaluateDiscount(input);
    case "CREATE_BUNDLE":
      return policy.allowBundles
        ? approved(proposal, "Bundle action is allowed by merchant policy.")
        : blocked(proposal, "Merchant policy does not allow bundles.");
    case "RECOMMEND_ALTERNATIVE":
      return policy.allowAlternativeProducts
        ? approved(
            proposal,
            "Alternative product recommendation is allowed by merchant policy.",
          )
        : blocked(
            proposal,
            "Merchant policy does not allow alternative product recommendations.",
          );
    case "START_CHECKOUT":
      return policy.allowCheckout
        ? approved(proposal, "Checkout start is allowed by merchant policy.")
        : blocked(proposal, "Merchant policy does not allow checkout.");
    case "EXPLAIN_VALUE":
      return approved(proposal, "Value explanation is allowed.");
    case "NO_ACTION":
      return approved(proposal, "No business action requested.");
  }
};

export const shouldCountAsCompletedOffer = (_decision: PolicyDecision): false => false;
