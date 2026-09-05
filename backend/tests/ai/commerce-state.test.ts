import assert from "node:assert/strict";
import test from "node:test";

import { buildCommerceResponse, deriveCommerceState } from "../../src/modules/ai/commerce-state.service";
import { extractIntentLocally } from "../../src/modules/ai/intent.service";
import { getFocusedCatalogResult } from "../../src/modules/ai/policy-proposal.service";
import type { CatalogResult } from "../../src/modules/ai/ai.types";
import type { Offer } from "../../src/modules/offers/offer.types";

const product: CatalogResult = { productId: "neural", name: "NeuralBook X15", price: 69999, specifications: {}, tags: [], useCases: [], matchScore: 1, matchReasons: [] };
const offer: Offer = { conversationId: "c", productId: "neural", actionType: "CREATE_DISCOUNT", requestedDiscountPercent: 15, approvedDiscountPercent: 10, originalAmount: 6999900, discountAmount: 699990, finalAmount: 6299910, currency: "INR", amountUnit: "paise", policyDecision: "MODIFIED", status: "created", reason: "Capped", expiresAt: new Date(Date.now() + 60_000), executionKey: "offer:test" };
const intentInput = (message: string) => ({ latestCustomerMessage: message, recentMessages: [], currentContext: { category: "laptop" as const, budget: 70000, useCases: [], preferences: [] } });

test("natural price hesitation and explicit discount requests remain deterministic", () => {
  for (const message of ["so expensive it is", "it's too expensive", "can I get a 15% discount?"]) {
    const intent = extractIntentLocally(intentInput(message));
    assert.equal(intent.customerState, "hesitating");
    assert.equal(intent.priceSensitivity, "high");
  }
});

test("pronoun follow-up retains the previous focused product", () => {
  const alternative = { ...product, productId: "other", name: "DevBook Air 14" };
  assert.equal(getFocusedCatalogResult([alternative, product], "so expensive it is", "neural")?.productId, "neural");
});

test("offer and payment states override generic recommendation copy", () => {
  assert.equal(deriveCommerceState(offer, null), "OFFER_AVAILABLE");
  assert.match(buildCommerceResponse({ state: "OFFER_AVAILABLE", offer, focusedProduct: product }) ?? "", /already have.*10%/i);
  const accepted = { ...offer, status: "accepted" as const };
  assert.match(buildCommerceResponse({ state: "OFFER_ACCEPTED", offer: accepted, focusedProduct: product }) ?? "", /Razorpay checkout/i);
  assert.equal(deriveCommerceState(accepted, { status: "verified" } as never), "PAYMENT_VERIFIED");
  assert.match(buildCommerceResponse({ state: "PAYMENT_VERIFIED", offer: accepted, focusedProduct: product }) ?? "", /verified successfully/i);
});
