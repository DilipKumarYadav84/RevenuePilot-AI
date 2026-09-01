import assert from "node:assert/strict";
import test from "node:test";

import { proposePolicyAction } from "../../src/modules/ai/policy-proposal.service";
import { evaluatePolicy } from "../../src/modules/policies/policy.engine";
import {
  buildExecutableOfferCountQuery,
  decisionConsumesOffer,
  EXECUTABLE_OFFER_STATUSES,
} from "../../src/modules/policies/policy.service";
import type {
  ActionProposal,
  MerchantPolicy,
} from "../../src/modules/policies/policy.types";
import {
  actionProposalSchema,
  merchantPolicyUpdateSchema,
} from "../../src/modules/policies/policy.validation";

const basePolicy: MerchantPolicy = {
  merchantKey: "technova",
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

const discountProposal = (
  requestedDiscountPercent: number,
): ActionProposal => ({
  action: "CREATE_DISCOUNT",
  conversationId: "507f1f77bcf86cd799439011",
  productId: "507f1f77bcf86cd799439012",
  orderValue: 64999,
  requestedDiscountPercent,
  reason: "Customer is price sensitive.",
});

test("5% discount is approved", () => {
  const decision = evaluatePolicy({
    proposal: discountProposal(5),
    policy: basePolicy,
    completedOffersForConversation: 0,
  });

  assert.equal(decision.decision, "APPROVED");
  assert.equal(decision.approvedAction?.approvedDiscountPercent, 5);
});

test("9% discount requires approval", () => {
  const decision = evaluatePolicy({
    proposal: discountProposal(9),
    policy: basePolicy,
    completedOffersForConversation: 0,
  });

  assert.equal(decision.decision, "REQUIRES_APPROVAL");
  assert.equal(decision.requiresHumanApproval, true);
});

test("15% discount is modified to max allowed", () => {
  const decision = evaluatePolicy({
    proposal: discountProposal(15),
    policy: basePolicy,
    completedOffersForConversation: 0,
  });

  assert.equal(decision.decision, "MODIFIED");
  assert.equal(decision.approvedAction?.approvedDiscountPercent, 10);
});

test("fresh conversation quota allows 15% proposal to be modified", () => {
  const decision = evaluatePolicy({
    proposal: discountProposal(15),
    policy: basePolicy,
    completedOffersForConversation: 0,
  });

  assert.equal(decision.decision, "MODIFIED");
  assert.equal(decision.approvedAction?.approvedDiscountPercent, 10);
});

test("policy decisions do not consume offer quota", () => {
  const firstDecision = evaluatePolicy({
    proposal: discountProposal(15),
    policy: basePolicy,
    completedOffersForConversation: 0,
  });
  const secondDecision = evaluatePolicy({
    proposal: discountProposal(15),
    policy: basePolicy,
    completedOffersForConversation: 0,
  });

  assert.equal(firstDecision.decision, "MODIFIED");
  assert.equal(secondDecision.decision, "MODIFIED");
  assert.equal(decisionConsumesOffer(firstDecision), false);
  assert.equal(decisionConsumesOffer(secondDecision), false);
});

test("blocked and approval-required evaluations do not consume offer quota", () => {
  const blockedDecision = evaluatePolicy({
    proposal: {
      ...discountProposal(5),
      orderValue: 500,
    },
    policy: basePolicy,
    completedOffersForConversation: 0,
  });
  const approvalDecision = evaluatePolicy({
    proposal: discountProposal(9),
    policy: basePolicy,
    completedOffersForConversation: 0,
  });

  assert.equal(blockedDecision.decision, "BLOCKED");
  assert.equal(approvalDecision.decision, "REQUIRES_APPROVAL");
  assert.equal(decisionConsumesOffer(blockedDecision), false);
  assert.equal(decisionConsumesOffer(approvalDecision), false);
});

test("offer-limit query counts only executable persisted discount offers", () => {
  const query = buildExecutableOfferCountQuery("507f1f77bcf86cd799439011");

  assert.equal(query.conversationId, "507f1f77bcf86cd799439011");
  assert.equal(query.actionType, "CREATE_DISCOUNT");
  assert.deepEqual(query.status, { $in: EXECUTABLE_OFFER_STATUSES });
  assert.deepEqual(EXECUTABLE_OFFER_STATUSES, ["created", "accepted"]);
});

test("discount disabled is blocked", () => {
  const decision = evaluatePolicy({
    proposal: discountProposal(5),
    policy: {
      ...basePolicy,
      allowDiscounts: false,
    },
    completedOffersForConversation: 0,
  });

  assert.equal(decision.decision, "BLOCKED");
});

test("order below minimum is blocked", () => {
  const decision = evaluatePolicy({
    proposal: {
      ...discountProposal(5),
      orderValue: 500,
    },
    policy: basePolicy,
    completedOffersForConversation: 0,
  });

  assert.equal(decision.decision, "BLOCKED");
  assert.match(decision.reason, /at least 1000/);
});

test("maximum offers reached is blocked", () => {
  const decision = evaluatePolicy({
    proposal: discountProposal(5),
    policy: basePolicy,
    completedOffersForConversation: 1,
  });

  assert.equal(decision.decision, "BLOCKED");
});

test("START_CHECKOUT allowed", () => {
  const decision = evaluatePolicy({
    proposal: {
      action: "START_CHECKOUT",
      conversationId: "507f1f77bcf86cd799439011",
    },
    policy: basePolicy,
    completedOffersForConversation: 0,
  });

  assert.equal(decision.decision, "APPROVED");
});

test("START_CHECKOUT disabled", () => {
  const decision = evaluatePolicy({
    proposal: {
      action: "START_CHECKOUT",
      conversationId: "507f1f77bcf86cd799439011",
    },
    policy: {
      ...basePolicy,
      allowCheckout: false,
    },
    completedOffersForConversation: 0,
  });

  assert.equal(decision.decision, "BLOCKED");
});

test("invalid action is rejected", () => {
  const parsed = actionProposalSchema.safeParse({
    action: "CREATE_COUPON",
  });

  assert.equal(parsed.success, false);
});

test("policy update validation rejects threshold above max", () => {
  const parsed = merchantPolicyUpdateSchema.safeParse({
    maxDiscountPercent: 5,
    approvalThresholdPercent: 8,
  });

  assert.equal(parsed.success, false);
});

test("AI proposal service proposes discount without executing it", () => {
  const proposal = proposePolicyAction(
    "507f1f77bcf86cd799439011",
    {
      intent: "product_search",
      category: "laptop",
      budget: 70000,
      useCases: ["AI development"],
      preferences: [],
      priceSensitivity: "high",
      purchaseIntent: "medium",
      abandonmentRisk: "medium",
      customerState: "hesitating",
    },
    [
      {
        productId: "507f1f77bcf86cd799439012",
        name: "NeuralBook X15",
        price: 69999,
        specifications: {},
        tags: ["ai-development"],
        useCases: ["AI/ML development"],
        matchScore: 120,
        matchReasons: ["Category matches laptop"],
      },
    ],
  );

  assert.equal(proposal.action, "CREATE_DISCOUNT");
  assert.equal(proposal.requestedDiscountPercent, 15);
});
