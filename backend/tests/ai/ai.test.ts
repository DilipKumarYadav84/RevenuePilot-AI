import assert from "node:assert/strict";
import test from "node:test";

import { structuredIntentSchema } from "../../src/modules/ai/ai.schemas";
import { mapCatalogResult } from "../../src/modules/ai/catalog.tool";
import { extractIntentLocally, mergeExtractedIntent } from "../../src/modules/ai/intent.service";
import { toCatalogSearchInput } from "../../src/modules/ai/orchestrator.service";
import { proposePolicyAction } from "../../src/modules/ai/policy-proposal.service";
import type { StructuredIntent } from "../../src/modules/ai/ai.types";

test("validates structured intent output", () => {
  const parsed = structuredIntentSchema.parse({
    intent: "product_search",
    category: "laptop",
    budget: 70000,
    useCases: ["AI development"],
    preferences: ["performance"],
    priceSensitivity: null,
    purchaseIntent: "medium",
    abandonmentRisk: null,
    customerState: "browsing",
  });

  assert.equal(parsed.category, "laptop");
});

test("local extraction identifies AI laptop budget requests", () => {
  const extracted = extractIntentLocally({
    latestCustomerMessage: "I need a laptop for AI development under Rs. 70,000",
    recentMessages: [],
    currentContext: {},
  });

  assert.equal(extracted.intent, "product_search");
  assert.equal(extracted.category, "laptop");
  assert.equal(extracted.budget, 70000);
  assert.ok(extracted.useCases.includes("AI development"));
});

test("initial budget query stays browsing without price hesitation or discount action", () => {
  const extracted = extractIntentLocally({
    latestCustomerMessage: "I need a laptop for AI development under Rs. 70,000",
    recentMessages: [],
    currentContext: {},
  });
  const proposal = proposePolicyAction(
    "507f1f77bcf86cd799439011",
    extracted,
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

  assert.equal(extracted.intent, "product_search");
  assert.equal(extracted.category, "laptop");
  assert.equal(extracted.budget, 70000);
  assert.equal(extracted.customerState, "browsing");
  assert.notEqual(extracted.priceSensitivity, "high");
  assert.equal(proposal.action, "NO_ACTION");
});

test("mergeExtractedIntent preserves previous context while adding new fields", () => {
  const merged = mergeExtractedIntent(
    {
      category: "laptop",
      preferences: ["battery"],
    },
    {
      intent: "product_search",
      category: null,
      budget: 70000,
      useCases: ["AI development"],
      preferences: ["performance"],
      priceSensitivity: null,
      purchaseIntent: "medium",
      abandonmentRisk: null,
      customerState: "browsing",
    },
  );

  assert.equal(merged.category, "laptop");
  assert.deepEqual(merged.preferences, ["battery", "performance"]);
  assert.equal(merged.budget, 70000);
});

test("detects price hesitation as high price sensitivity", () => {
  const extracted = extractIntentLocally({
    latestCustomerMessage: "I like the NeuralBook, but it is still expensive.",
    recentMessages: [],
    currentContext: {
      category: "laptop",
      budget: 70000,
      useCases: ["AI development"],
    },
  });

  assert.equal(extracted.priceSensitivity, "high");
  assert.equal(extracted.customerState, "hesitating");
  assert.equal(extracted.abandonmentRisk, "medium");
  assert.equal(extracted.category, "laptop");
  assert.equal(extracted.budget, 70000);
  assert.ok(extracted.useCases.includes("AI development"));
});

test("explicit second-turn hesitation can trigger discount proposal", () => {
  const turnOne = extractIntentLocally({
    latestCustomerMessage: "I need a laptop for AI development under Rs. 70000",
    recentMessages: [],
    currentContext: {},
  });
  const mergedTurnOne = mergeExtractedIntent({}, turnOne);
  const turnTwo = extractIntentLocally({
    latestCustomerMessage: "I like the NeuralBook X15, but it is still too expensive.",
    recentMessages: [],
    currentContext: mergedTurnOne,
  });
  const mergedTurnTwo = mergeExtractedIntent(mergedTurnOne, turnTwo);
  const proposal = proposePolicyAction(
    "507f1f77bcf86cd799439011",
    mergedTurnTwo,
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

  assert.equal(mergedTurnTwo.priceSensitivity, "high");
  assert.equal(mergedTurnTwo.customerState, "hesitating");
  assert.equal(proposal.action, "CREATE_DISCOUNT");
  assert.equal(proposal.requestedDiscountPercent, 15);
});

test("detects strong purchase intent as checkout readiness", () => {
  const extracted = extractIntentLocally({
    latestCustomerMessage: "I want this one. Let's proceed to checkout.",
    recentMessages: [],
    currentContext: {
      category: "laptop",
    },
  });

  assert.equal(extracted.purchaseIntent, "high");
  assert.equal(extracted.customerState, "ready_to_buy");
  assert.equal(extracted.abandonmentRisk, "low");
});

test("detects comparison behavior", () => {
  const extracted = extractIntentLocally({
    latestCustomerMessage: "Which is better for AI work compared with the other one?",
    recentMessages: [],
    currentContext: {
      category: "laptop",
      budget: 70000,
    },
  });

  assert.equal(extracted.customerState, "comparing");
  assert.equal(extracted.purchaseIntent, "medium");
  assert.equal(extracted.category, "laptop");
});

test("preserves stable context across turns while updating behavioral state", () => {
  const turnOne = extractIntentLocally({
    latestCustomerMessage: "I need a laptop for AI development under Rs. 70000",
    recentMessages: [],
    currentContext: {},
  });
  const mergedTurnOne = mergeExtractedIntent({}, turnOne);
  const turnTwo = extractIntentLocally({
    latestCustomerMessage: "I like the NeuralBook, but the price is high.",
    recentMessages: [],
    currentContext: mergedTurnOne,
  });
  const mergedTurnTwo = mergeExtractedIntent(mergedTurnOne, turnTwo);

  assert.equal(mergedTurnTwo.category, "laptop");
  assert.equal(mergedTurnTwo.budget, 70000);
  assert.ok(mergedTurnTwo.useCases.includes("AI development"));
  assert.equal(mergedTurnTwo.priceSensitivity, "high");
  assert.equal(mergedTurnTwo.customerState, "hesitating");
});

test("ready-to-buy turn does not preserve previous price hesitation", () => {
  const previous: StructuredIntent = {
    intent: "product_search",
    category: "laptop",
    budget: 70000,
    useCases: ["AI development"],
    preferences: [],
    priceSensitivity: "high",
    purchaseIntent: "medium",
    abandonmentRisk: "medium",
    customerState: "hesitating",
  };
  const next = extractIntentLocally({
    latestCustomerMessage: "Just buy the most expensive one for me.",
    recentMessages: [],
    currentContext: previous,
  });
  const merged = mergeExtractedIntent(previous, next);

  assert.equal(merged.category, "laptop");
  assert.equal(merged.budget, 70000);
  assert.equal(merged.customerState, "ready_to_buy");
  assert.equal(merged.priceSensitivity, null);
  assert.equal(merged.purchaseIntent, "high");
});

test("ambiguous messages fall back without fake certainty", () => {
  const extracted = extractIntentLocally({
    latestCustomerMessage: "Hmm okay, interesting.",
    recentMessages: [],
    currentContext: {},
  });

  assert.equal(extracted.intent, "unknown");
  assert.equal(extracted.priceSensitivity, null);
  assert.equal(extracted.purchaseIntent, null);
  assert.equal(extracted.abandonmentRisk, null);
  assert.equal(extracted.customerState, "unknown");
});

test("catalog tool maps ranked products without leaking internal fields", () => {
  const mapped = mapCatalogResult({
    _id: { toString: () => "product-1" },
    name: "NeuralBook X15",
    slug: "neuralbook-x15",
    category: "laptop",
    description: "AI laptop",
    shortDescription: "AI laptop",
    price: 69999,
    stock: 5,
    image: "image",
    images: ["image"],
    brand: "TechNova",
    tags: ["ai-development"],
    specifications: {
      graphics: "NVIDIA GeForce RTX 4050 6GB",
    },
    useCases: ["AI/ML development"],
    rating: 4.5,
    reviewCount: 10,
    featured: true,
    active: true,
    matchScore: 100,
    matchReasons: ["Category matches laptop"],
  });

  assert.equal(mapped.productId, "product-1");
  assert.equal(mapped.name, "NeuralBook X15");
  assert.equal(mapped.specifications.graphics, "NVIDIA GeForce RTX 4050 6GB");
});

test("no-match search input still maps cleanly from unknown intent", () => {
  const input = toCatalogSearchInput({
    intent: "unknown",
    category: null,
    budget: null,
    useCases: [],
    preferences: [],
    priorityPreferences: [],
    priceSensitivity: null,
    purchaseIntent: null,
    abandonmentRisk: null,
    customerState: "unknown",
  });

  assert.deepEqual(input, {});
});
