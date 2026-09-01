import assert from "node:assert/strict";
import test from "node:test";

import { structuredIntentSchema } from "../../src/modules/ai/ai.schemas";
import { createLocalAIProvider } from "../../src/modules/ai/ai.provider";
import {
  createOpenAIProvider,
  isGroundedRecommendationText,
} from "../../src/modules/ai/openai.provider";
import type {
  AssistantResponseInput,
  IntentExtractionInput,
  StructuredIntent,
} from "../../src/modules/ai/ai.types";

const baseInput: IntentExtractionInput = {
  latestCustomerMessage: "I need a laptop for AI development under Rs. 70,000",
  recentMessages: [],
  currentContext: {},
};

const validIntent: StructuredIntent = {
  intent: "product_search",
  category: "laptop",
  budget: 70000,
  useCases: ["AI development"],
  preferences: ["performance"],
  priceSensitivity: null,
  purchaseIntent: "medium",
  abandonmentRisk: null,
  customerState: "browsing",
};

const catalogInput: AssistantResponseInput = {
  intent: validIntent,
  catalogResults: [
    {
      productId: "product-1",
      name: "NeuralBook X15",
      price: 69999,
      specifications: {
        graphics: "NVIDIA RTX 4050",
        battery: "58Wh",
      },
      tags: ["ai-development"],
      useCases: ["AI development"],
      matchScore: 120,
      matchReasons: ["Within budget", "GPU fit"],
    },
    {
      productId: "product-2",
      name: "DevBook Pro 14",
      price: 68999,
      specifications: {
        battery: "72Wh",
      },
      tags: ["portable"],
      useCases: ["development"],
      matchScore: 100,
      matchReasons: ["Battery focused"],
    },
  ],
};

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const outputTextResponse = (text: string): Response =>
  jsonResponse({
    output: [
      {
        content: [
          {
            type: "output_text",
            text,
          },
        ],
      },
    ],
  });

const createProvider = (fetcher: typeof fetch, apiKey = "test-ai-key") =>
  createOpenAIProvider({
    apiKey,
    model: "gpt-test",
    fallbackProvider: createLocalAIProvider("local-rules-v1"),
    timeoutMs: 50,
    fetcher,
  });

test("OpenAI provider accepts valid structured response", async () => {
  const provider = createProvider(async () =>
    outputTextResponse(JSON.stringify(validIntent)),
  );

  const extracted = await provider.generateStructuredOutput(baseInput);

  assert.deepEqual(extracted, validIntent);
  assert.deepEqual(provider.getMetadata(), {
    provider: "openai",
    model: "gpt-test",
  });
});

test("invalid structured provider response is rejected by schema", () => {
  assert.throws(() =>
    structuredIntentSchema.parse({
      ...validIntent,
      customerState: "discount_me_now",
    }),
  );
});

test("OpenAI provider retries structured output once after invalid JSON", async () => {
  let calls = 0;
  const provider = createProvider(async () => {
    calls += 1;
    return outputTextResponse(
      calls === 1 ? JSON.stringify({ not: "valid" }) : JSON.stringify(validIntent),
    );
  });

  const extracted = await provider.generateStructuredOutput(baseInput);

  assert.equal(calls, 2);
  assert.deepEqual(extracted, validIntent);
});

test("provider failure falls back safely to local extraction", async () => {
  const provider = createProvider(async () => {
    throw new Error("rate_limit_exceeded");
  });

  const extracted = await provider.generateStructuredOutput(baseInput);
  const metadata = provider.getMetadata();

  assert.equal(extracted.intent, "product_search");
  assert.equal(extracted.category, "laptop");
  assert.equal(extracted.customerState, "browsing");
  assert.equal(metadata.provider, "local");
  assert.equal(metadata.fallbackProvider, "openai");
  assert.equal(metadata.fallbackReason, "rate_limit_exceeded");
});

test("budget-only external extraction remains browsing", async () => {
  const provider = createProvider(async () =>
    outputTextResponse(JSON.stringify(validIntent)),
  );

  const extracted = await provider.generateStructuredOutput(baseInput);

  assert.equal(extracted.budget, 70000);
  assert.equal(extracted.customerState, "browsing");
  assert.notEqual(extracted.priceSensitivity, "high");
});

test("explicit external price hesitation becomes hesitating", async () => {
  const provider = createProvider(async () =>
    outputTextResponse(
      JSON.stringify({
        ...validIntent,
        priceSensitivity: "high",
        purchaseIntent: "medium",
        abandonmentRisk: "medium",
        customerState: "hesitating",
      }),
    ),
  );

  const extracted = await provider.generateStructuredOutput({
    latestCustomerMessage: "I like the NeuralBook X15, but it is still too expensive.",
    recentMessages: [],
    currentContext: {
      category: "laptop",
      budget: 70000,
      useCases: ["AI development"],
    },
  });

  assert.equal(extracted.priceSensitivity, "high");
  assert.equal(extracted.customerState, "hesitating");
});

test("provider receives concise previous context for multi-turn preservation", async () => {
  let knownContext: unknown;
  const provider = createProvider(async (_input, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    const userContent = body.input?.[1]?.content;
    knownContext = JSON.parse(userContent).knownContext;

    return outputTextResponse(
      JSON.stringify({
        ...validIntent,
        priceSensitivity: "high",
        customerState: "hesitating",
      }),
    );
  });

  const extracted = await provider.generateStructuredOutput({
    latestCustomerMessage: "That price is high.",
    recentMessages: [
      { role: "customer", content: "I need a laptop for AI development." },
    ],
    currentContext: {
      category: "laptop",
      budget: 70000,
      useCases: ["AI development"],
    },
  });

  assert.deepEqual(knownContext, {
    category: "laptop",
    budget: 70000,
    useCases: ["AI development"],
  });
  assert.equal(extracted.category, "laptop");
  assert.equal(extracted.budget, 70000);
});

test("recommendation text falls back when it uses a product absent from catalog results", async () => {
  const provider = createProvider(async () =>
    outputTextResponse("GhostBook Pro is the better fit for AI workloads."),
  );

  const text = await provider.generateText(catalogInput);

  assert.match(text, /NeuralBook X15/);
  assert.doesNotMatch(text, /GhostBook Pro/);
  assert.equal(provider.getMetadata().provider, "local");
});

test("missing OpenAI API key falls back cleanly", async () => {
  const provider = createProvider(async () => {
    throw new Error("fetch should not be called");
  }, "");

  const extracted = await provider.generateStructuredOutput(baseInput);

  assert.equal(extracted.intent, "product_search");
  assert.equal(provider.getMetadata().fallbackReason, "AI_API_KEY is missing.");
});

test("provider/model metadata is safe after recommendation generation", async () => {
  const provider = createProvider(async () =>
    outputTextResponse(
      "NeuralBook X15 fits AI development under Rs. 70,000, while DevBook Pro 14 is stronger for battery life.",
    ),
  );

  assert.equal(
    isGroundedRecommendationText(
      "NeuralBook X15 is grounded in the supplied catalog.",
      catalogInput,
    ),
    true,
  );

  await provider.generateText(catalogInput);

  assert.deepEqual(provider.getMetadata(), {
    provider: "openai",
    model: "gpt-test",
    responseProvider: "openai",
    responseModel: "gpt-test",
  });
  assert.equal(JSON.stringify(provider.getMetadata()).includes("test-ai-key"), false);
});
