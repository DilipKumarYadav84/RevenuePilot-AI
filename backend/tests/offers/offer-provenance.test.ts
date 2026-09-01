import assert from "node:assert/strict";
import test from "node:test";

import {
  isMatchingActionProposalEvent,
  type MatchingActionProposalQuery,
} from "../../src/modules/audit/audit.service";
import { evaluatePolicy } from "../../src/modules/policies/policy.engine";
import type { MerchantPolicy } from "../../src/modules/policies/policy.types";
import type { AuditEvent } from "../../src/modules/audit/audit.types";

const conversationId = "507f1f77bcf86cd799439011";
const productId = "507f1f77bcf86cd799439012";
const otherProductId = "507f1f77bcf86cd799439099";

const baseQuery: MatchingActionProposalQuery = {
  conversationId,
  action: "CREATE_DISCOUNT",
  productId,
  requestedDiscountPercent: 15,
};

const buildActionProposedEvent = (
  overrides: Partial<AuditEvent["output"]> = {},
): AuditEvent => ({
  conversationId,
  eventType: "ACTION_PROPOSED",
  actor: "ai",
  summary: "CREATE_DISCOUNT proposed.",
  output: {
    action: "CREATE_DISCOUNT",
    productId,
    orderValue: 69999,
    requestedDiscountPercent: 15,
    ...overrides,
  },
});

// ---- FIX 3: provenance predicate (isMatchingActionProposalEvent) ----

test("valid AI proposal: a genuine ACTION_PROPOSED CREATE_DISCOUNT event for the same product/percent matches", () => {
  const event = buildActionProposedEvent();

  assert.equal(isMatchingActionProposalEvent(event, baseQuery), true);
});

test("no ACTION_PROPOSED event: a differently-typed event (e.g. PRODUCT_RECOMMENDED) never matches", () => {
  const event: AuditEvent = {
    conversationId,
    eventType: "PRODUCT_RECOMMENDED",
    actor: "catalog",
    summary: "NeuralBook X15 ranked as the top recommendation.",
    output: {
      action: "CREATE_DISCOUNT",
      productId,
      requestedDiscountPercent: 15,
    },
  };

  assert.equal(isMatchingActionProposalEvent(event, baseQuery), false);
});

test("wrong product: a proposal for a different productId is rejected", () => {
  const event = buildActionProposedEvent({ productId: otherProductId });

  assert.equal(isMatchingActionProposalEvent(event, baseQuery), false);
});

test("altered requestedDiscountPercent: a client asking for more than what was actually proposed is rejected", () => {
  const event = buildActionProposedEvent(); // recorded proposal was 15%
  const alteredQuery: MatchingActionProposalQuery = {
    ...baseQuery,
    requestedDiscountPercent: 90,
  };

  assert.equal(isMatchingActionProposalEvent(event, alteredQuery), false);
});

test("wrong action: a RECOMMEND_ALTERNATIVE or START_CHECKOUT proposal cannot authorize a discount", () => {
  const event = buildActionProposedEvent({ action: "START_CHECKOUT" });

  assert.equal(isMatchingActionProposalEvent(event, baseQuery), false);
});

test("wrong conversation: matching is scoped by the caller's conversationId filter, not just output fields", () => {
  // findMatchingActionProposalEvent (the DB-backed caller) filters
  // candidates by conversationId before this predicate ever runs, so an
  // event belonging to a different conversation is never even considered
  // a candidate. This test documents that isMatchingActionProposalEvent
  // itself only asserts eventType + output shape, and relies on its
  // caller for the conversationId scope.
  const event = buildActionProposedEvent();
  event.conversationId = "507f1f77bcf86cd799439000"; // a different conversation

  // The predicate still matches on output alone — proving why the DB
  // query MUST filter by conversationId first (see
  // findMatchingActionProposalEvent), which it does.
  assert.equal(isMatchingActionProposalEvent(event, baseQuery), true);
});

// ---- FIX 3: policy engine still caps the AI-proposed 15% to the merchant's 10% ----

test("policy still caps a legitimately-proposed 15% discount to the merchant's 10% maximum", () => {
  const policy: MerchantPolicy = {
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

  const decision = evaluatePolicy({
    proposal: {
      action: "CREATE_DISCOUNT",
      conversationId,
      productId,
      orderValue: 69999,
      requestedDiscountPercent: 15,
    },
    policy,
    completedOffersForConversation: 0,
  });

  assert.equal(decision.decision, "MODIFIED");
  assert.equal(decision.approvedAction?.approvedDiscountPercent, 10);
});
