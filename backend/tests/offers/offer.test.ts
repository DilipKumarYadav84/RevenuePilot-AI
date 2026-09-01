import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePolicy } from "../../src/modules/policies/policy.engine";
import type { MerchantPolicy, PolicyDecision } from "../../src/modules/policies/policy.types";
import {
  buildExecutionKey,
  calculateDiscountAmounts,
  canAcceptOffer,
  canCreateOfferFromPolicyDecision,
  createOfferAcceptedAuditInput,
  createOfferCreatedAuditInput,
  createPolicyProposalFromProductPrice,
  isOfferExpired,
  rupeesToPaise,
} from "../../src/modules/offers/offer.service";
import type { CreateOfferInput, Offer } from "../../src/modules/offers/offer.types";
import { createOfferSchema } from "../../src/modules/offers/offer.validation";

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

const offerInput: CreateOfferInput = {
  action: "CREATE_DISCOUNT",
  conversationId: "507f1f77bcf86cd799439011",
  productId: "507f1f77bcf86cd799439012",
  requestedDiscountPercent: 15,
};

const sampleOffer = (status: Offer["status"] = "created"): Offer => ({
  conversationId: offerInput.conversationId,
  productId: offerInput.productId,
  actionType: "CREATE_DISCOUNT",
  requestedDiscountPercent: 15,
  approvedDiscountPercent: 10,
  originalAmount: 6999900,
  discountAmount: 699990,
  finalAmount: 6299910,
  currency: "INR",
  amountUnit: "paise",
  policyDecision: "MODIFIED",
  status,
  reason: "Merchant policy limits discounts to 10%.",
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  executionKey: buildExecutionKey(offerInput),
});

const discountDecision = (
  requestedDiscountPercent: number,
  completedOffersForConversation = 0,
): PolicyDecision =>
  evaluatePolicy({
    proposal: {
      ...offerInput,
      orderValue: 69999,
      requestedDiscountPercent,
    },
    policy: basePolicy,
    completedOffersForConversation,
  });

test("APPROVED policy result creates offer eligibility", () => {
  assert.equal(canCreateOfferFromPolicyDecision(discountDecision(5)), true);
});

test("MODIFIED policy result creates capped offer eligibility", () => {
  const decision = discountDecision(15);

  assert.equal(decision.decision, "MODIFIED");
  assert.equal(decision.approvedAction?.approvedDiscountPercent, 10);
  assert.equal(canCreateOfferFromPolicyDecision(decision), true);
});

test("BLOCKED policy result does not create offer", () => {
  const decision = evaluatePolicy({
    proposal: {
      ...offerInput,
      orderValue: 500,
    },
    policy: basePolicy,
    completedOffersForConversation: 0,
  });

  assert.equal(decision.decision, "BLOCKED");
  assert.equal(canCreateOfferFromPolicyDecision(decision), false);
});

test("REQUIRES_APPROVAL policy result does not create offer", () => {
  const decision = discountDecision(9);

  assert.equal(decision.decision, "REQUIRES_APPROVAL");
  assert.equal(canCreateOfferFromPolicyDecision(decision), false);
});

test("server-side proposal uses product price instead of client-supplied price", () => {
  const unsafeBody = {
    ...offerInput,
    originalAmount: 1,
    orderValue: 1,
    approvedDiscountPercent: 99,
  };
  const parsed = createOfferSchema.safeParse(unsafeBody);
  const proposal = createPolicyProposalFromProductPrice(offerInput, 69999);

  assert.equal(parsed.success, false);
  assert.equal(proposal.orderValue, 69999);
});

test("discount arithmetic is paise-safe", () => {
  const originalAmount = rupeesToPaise(69999);
  const amounts = calculateDiscountAmounts(originalAmount, 10);

  assert.equal(originalAmount, 6999900);
  assert.equal(amounts.discountAmount, 699990);
  assert.equal(amounts.finalAmount, 6299910);
});

test("duplicate creation key is stable", () => {
  assert.equal(buildExecutionKey(offerInput), buildExecutionKey({ ...offerInput }));
});

test("expired offer cannot be accepted", () => {
  const offer = {
    ...sampleOffer(),
    expiresAt: new Date("2026-08-28T10:00:00.000Z"),
  };
  const now = new Date("2026-08-28T10:00:01.000Z");

  assert.equal(isOfferExpired(offer, now), true);
  assert.equal(canAcceptOffer(offer, now).allowed, false);
});

test("accepted offer cannot be accepted again", () => {
  assert.equal(canAcceptOffer(sampleOffer("accepted")).allowed, false);
});

test("rejected offer cannot be accepted", () => {
  assert.equal(canAcceptOffer(sampleOffer("rejected")).allowed, false);
});

test("OFFER_CREATED audit event is emitted with safe money fields", () => {
  const auditInput = createOfferCreatedAuditInput(sampleOffer());

  assert.equal(auditInput.eventType, "OFFER_CREATED");
  assert.equal(auditInput.output?.finalAmount, 6299910);
  assert.equal(auditInput.output?.amountUnit, "paise");
});

test("OFFER_ACCEPTED audit event is emitted with final payable amount", () => {
  const auditInput = createOfferAcceptedAuditInput(
    "507f1f77bcf86cd799439013",
    sampleOffer("accepted"),
  );

  assert.equal(auditInput.eventType, "OFFER_ACCEPTED");
  assert.equal(auditInput.output?.finalAmount, 6299910);
});
