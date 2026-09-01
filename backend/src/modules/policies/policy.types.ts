export type PolicyDecisionStatus =
  | "APPROVED"
  | "MODIFIED"
  | "BLOCKED"
  | "REQUIRES_APPROVAL";

export type PolicyActionName =
  | "CREATE_DISCOUNT"
  | "CREATE_BUNDLE"
  | "RECOMMEND_ALTERNATIVE"
  | "START_CHECKOUT"
  | "EXPLAIN_VALUE"
  | "NO_ACTION";

export type MerchantPolicy = {
  merchantKey: string;
  maxDiscountPercent: number;
  approvalThresholdPercent: number;
  minimumOrderAmount: number;
  maximumOffersPerConversation: number;
  offerExpiryMinutes: number;
  allowDiscounts: boolean;
  allowBundles: boolean;
  allowAlternativeProducts: boolean;
  allowCheckout: boolean;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export type ActionProposal = {
  action: PolicyActionName;
  conversationId?: string | undefined;
  productId?: string | undefined;
  orderValue?: number | undefined;
  requestedDiscountPercent?: number | undefined;
  reason?: string | undefined;
};

export type ApprovedPolicyAction = {
  action: PolicyActionName;
  approvedDiscountPercent?: number | undefined;
};

export type PolicyDecision = {
  decision: PolicyDecisionStatus;
  requestedAction: ActionProposal;
  approvedAction: ApprovedPolicyAction | null;
  reason: string;
  requiresHumanApproval: boolean;
};

export type PolicyEvaluationInput = {
  proposal: ActionProposal;
  policy: MerchantPolicy;
  completedOffersForConversation: number;
};
