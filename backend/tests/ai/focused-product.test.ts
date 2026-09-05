import assert from "node:assert/strict";
import test from "node:test";
import { getFocusedCatalogResult, proposePolicyAction } from "../../src/modules/ai/policy-proposal.service";
import { extractIntentLocally } from "../../src/modules/ai/intent.service";
import type { CatalogResult } from "../../src/modules/ai/ai.types";

const products: CatalogResult[] = [
  { productId: "first", name: "NeuralBook X15", price: 69999, specifications: {}, tags: [], useCases: [], matchScore: 100, matchReasons: [] },
  { productId: "focused", name: "DevBook Air 14", price: 54999, specifications: {}, tags: [], useCases: [], matchScore: 80, matchReasons: [] },
];
test("focused hesitation proposes the named eligible product with its server price", () => {
  const message = "DevBook Air 14 is so expensive but I really like it";
  const intent = extractIntentLocally({ latestCustomerMessage: message, recentMessages: [], currentContext: { category: "laptop", budget: 70000 } });
  const proposal = proposePolicyAction("conversation", intent, products, message);
  assert.equal(proposal.action, "CREATE_DISCOUNT");
  assert.equal(proposal.productId, "focused");
  assert.equal(proposal.orderValue, 54999);
  assert.equal(proposal.requestedDiscountPercent, 15);
  assert.equal(products[0]?.productId, "first");
});
test("buy now resolves the named alternative without changing ranking", () => {
  const message = "I'm ready to buy DevBook Air 14.";
  const intent = extractIntentLocally({ latestCustomerMessage: message, recentMessages: [], currentContext: { category: "laptop" } });
  const proposal = proposePolicyAction("conversation", intent, products, message);
  assert.equal(proposal.action, "START_CHECKOUT");
  assert.equal(proposal.productId, "focused");
});
test("focus is case insensitive and only matches complete eligible names", () => {
  assert.equal(getFocusedCatalogResult(products, "devbook AIR 14 is expensive")?.productId, "focused");
  assert.equal(getFocusedCatalogResult(products, "DevBook Air 140")?.productId, "first");
  assert.equal(getFocusedCatalogResult([], "DevBook Air 14"), undefined);
});
