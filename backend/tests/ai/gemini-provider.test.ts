import assert from "node:assert/strict";
import test from "node:test";

import { structuredIntentSchema } from "../../src/modules/ai/ai.schemas";
import { createLocalAIProvider } from "../../src/modules/ai/ai.provider";
import { buildRecommendationPrompt } from "../../src/modules/ai/ai.prompts";
import { createGeminiProvider } from "../../src/modules/ai/gemini.provider";
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
  preferences: ["ai-development"],
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
        ram: "16GB DDR5",
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
      tags: ["portable", "battery"],
      useCases: ["development"],
      matchScore: 100,
      matchReasons: ["Battery focused"],
    },
  ],
};

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const geminiTextResponse = (text: string): Response =>
  jsonResponse({
    candidates: [
      {
        content: {
          parts: [{ text }],
        },
        finishReason: "STOP",
      },
    ],
  });

const createProvider = (
  fetcher: typeof fetch,
  apiKey = "test-gemini-api-key",
  timeouts: {
    timeoutMs?: number;
    structuredTimeoutMs?: number;
    recommendationTimeoutMs?: number;
    structuredModel?: string;
  } = { timeoutMs: 50 },
) =>
  createGeminiProvider({
    apiKey,
    model: "gemini-test",
    structuredModel: timeouts.structuredModel,
    fallbackProvider: createLocalAIProvider("local-rules-v1"),
    ...timeouts,
    fetcher,
  });

test("Gemini provider accepts valid structured JSON response", async () => {
  const provider = createProvider(async (_input, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(body.generationConfig.responseSchema.type, "OBJECT");
    return geminiTextResponse(JSON.stringify(validIntent));
  });

  const extracted = await provider.generateStructuredOutput(baseInput);

  assert.deepEqual(extracted, validIntent);
  assert.deepEqual(provider.getMetadata(), {
    provider: "gemini",
    model: "gemini-test",
  });
});

test("Gemini structured extraction uses configured structured model and low thinking", async () => {
  let requestUrl = "";
  let requestBody: Record<string, any> = {};
  const provider = createProvider(
    async (input, init) => {
      requestUrl = String(input);
      requestBody = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      return geminiTextResponse(JSON.stringify(validIntent));
    },
    "test-gemini-api-key",
    {
      timeoutMs: 50,
      structuredModel: "gemini-3.5-flash-lite",
    },
  );

  await provider.generateStructuredOutput(baseInput);

  assert.match(requestUrl, /gemini-3\.5-flash-lite:generateContent/);
  assert.equal(requestBody.generationConfig.thinkingConfig.thinkingLevel, "low");
  assert.equal(provider.getMetadata().model, "gemini-3.5-flash-lite");
});

test("Gemini structured model falls back to recommendation model when absent", async () => {
  let requestUrl = "";
  const provider = createProvider(async (input) => {
    requestUrl = String(input);
    return geminiTextResponse(JSON.stringify(validIntent));
  });

  await provider.generateStructuredOutput(baseInput);

  assert.match(requestUrl, /gemini-test:generateContent/);
});

test("Gemini structured response passes Zod validation", async () => {
  const provider = createProvider(async () =>
    geminiTextResponse(JSON.stringify(validIntent)),
  );

  const extracted = await provider.generateStructuredOutput(baseInput);
  const parsed = structuredIntentSchema.parse(extracted);

  assert.deepEqual(parsed, validIntent);
});

test("Gemini retries structured output once after malformed JSON", async () => {
  let calls = 0;
  const provider = createProvider(async () => {
    calls += 1;
    return geminiTextResponse(calls === 1 ? "{not-json" : JSON.stringify(validIntent));
  });

  const extracted = await provider.generateStructuredOutput(baseInput);

  assert.equal(calls, 2);
  assert.deepEqual(extracted, validIntent);
});

test("Gemini retries structured output once after schema-invalid JSON", async () => {
  let calls = 0;
  const provider = createProvider(async () => {
    calls += 1;
    return geminiTextResponse(
      calls === 1
        ? JSON.stringify({ ...validIntent, customerState: "discount_me_now" })
        : JSON.stringify(validIntent),
    );
  });

  const extracted = await provider.generateStructuredOutput(baseInput);

  assert.equal(calls, 2);
  assert.deepEqual(extracted, validIntent);
});

test("Gemini second structured failure falls back to local extraction", async () => {
  const provider = createProvider(async () =>
    geminiTextResponse(JSON.stringify({ ...validIntent, customerState: "discount_me_now" })),
  );

  const extracted = await provider.generateStructuredOutput(baseInput);
  const metadata = provider.getMetadata();

  assert.equal(extracted.intent, "product_search");
  assert.equal(extracted.category, "laptop");
  assert.equal(extracted.customerState, "browsing");
  assert.equal(metadata.provider, "local");
  assert.equal(metadata.fallbackProvider, "gemini");
});

test("Gemini timeout falls back to local extraction", async () => {
  const provider = createProvider(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      }),
  );

  const extracted = await provider.generateStructuredOutput(baseInput);

  assert.equal(extracted.intent, "product_search");
  assert.equal(provider.getMetadata().fallbackReason, "Provider request timed out.");
});

test("Gemini HTTP 429 falls back safely", async () => {
  const provider = createProvider(async () =>
    jsonResponse(
      { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "quota" } },
      429,
    ),
  );

  const extracted = await provider.generateStructuredOutput(baseInput);

  assert.equal(extracted.intent, "product_search");
  assert.match(provider.getMetadata().fallbackReason ?? "", /HTTP 429/);
});

test("Gemini HTTP 5xx falls back safely", async () => {
  const provider = createProvider(async () =>
    jsonResponse(
      { error: { code: 503, status: "UNAVAILABLE", message: "try later" } },
      503,
    ),
  );

  const extracted = await provider.generateStructuredOutput(baseInput);

  assert.equal(extracted.intent, "product_search");
  assert.match(provider.getMetadata().fallbackReason ?? "", /HTTP 503/);
});

test("missing Gemini API key falls back cleanly", async () => {
  const provider = createProvider(async () => {
    throw new Error("fetch should not be called");
  }, "");

  const extracted = await provider.generateStructuredOutput(baseInput);

  assert.equal(extracted.intent, "product_search");
  assert.equal(provider.getMetadata().fallbackReason, "AI_API_KEY is missing.");
});

test("Gemini empty candidates fallback safely", async () => {
  const provider = createProvider(async () => jsonResponse({ candidates: [] }));

  const extracted = await provider.generateStructuredOutput(baseInput);

  assert.equal(extracted.intent, "product_search");
  assert.match(provider.getMetadata().fallbackReason ?? "", /candidates/);
});

test("Gemini blocked or empty content fallback safely", async () => {
  const provider = createProvider(async () =>
    jsonResponse({
      candidates: [
        {
          content: { parts: [] },
          finishReason: "SAFETY",
        },
      ],
    }),
  );

  const extracted = await provider.generateStructuredOutput(baseInput);

  assert.equal(extracted.intent, "product_search");
  assert.match(provider.getMetadata().fallbackReason ?? "", /blocked/);
});

test("Gemini budget-only query remains browsing", async () => {
  const provider = createProvider(async () =>
    geminiTextResponse(JSON.stringify(validIntent)),
  );

  const extracted = await provider.generateStructuredOutput(baseInput);

  assert.equal(extracted.budget, 70000);
  assert.equal(extracted.customerState, "browsing");
  assert.equal(extracted.priceSensitivity, null);
});

test("Gemini explicit expensive statement becomes hesitating", async () => {
  const provider = createProvider(async () =>
    geminiTextResponse(
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
    latestCustomerMessage: "I like the NeuralBook X15, but Rs. 69,999 is still too expensive.",
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

test("Gemini receives previous context for multi-turn preservation", async () => {
  let knownContext: unknown;
  const provider = createProvider(async (_input, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    const userContent = body.contents?.[0]?.parts?.[0]?.text;
    knownContext = JSON.parse(userContent).knownContext;

    return geminiTextResponse(
      JSON.stringify({
        ...validIntent,
        preferences: ["ai-development", "battery"],
      }),
    );
  });

  const extracted = await provider.generateStructuredOutput({
    latestCustomerMessage: "I care more about battery life than GPU power.",
    recentMessages: [
      { role: "customer", content: "I need a laptop for AI development under Rs. 70,000" },
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
  assert.ok(extracted.preferences.includes("battery"));
});

test("Gemini grounded recommendation response succeeds", async () => {
  let requestUrl = "";
  let requestBody: Record<string, any> = {};
  const provider = createProvider(async (input, init) => {
    requestUrl = String(input);
    requestBody = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    return geminiTextResponse(
      "NeuralBook X15 fits your AI-development workload under Rs. 70,000 because it includes NVIDIA RTX 4050 and 16GB DDR5. DevBook Pro 14 is the battery-focused alternative.",
    );
  });

  const text = await provider.generateText(catalogInput);

  assert.match(text, /NeuralBook X15/);
  assert.match(requestUrl, /gemini-test:generateContent/);
  assert.equal(requestBody.generationConfig.thinkingConfig.thinkingLevel, "low");
  assert.deepEqual(provider.getMetadata(), {
    provider: "gemini",
    model: "gemini-test",
    responseProvider: "gemini",
    responseModel: "gemini-test",
  });
});

test("Gemini structured extraction succeeds while recommendation timeout falls back locally", async () => {
  let calls = 0;
  const provider = createProvider(
    (_input, init) => {
      calls += 1;

      if (calls === 1) {
        return Promise.resolve(geminiTextResponse(JSON.stringify(validIntent)));
      }

      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    },
    "test-gemini-api-key",
    {
      structuredTimeoutMs: 50,
      recommendationTimeoutMs: 20,
    },
  );

  const extracted = await provider.generateStructuredOutput(baseInput);
  const text = await provider.generateText(catalogInput);
  const metadata = provider.getMetadata();

  assert.deepEqual(extracted, validIntent);
  assert.match(text, /NeuralBook X15/);
  assert.equal(calls, 2);
  assert.equal(metadata.structuredProvider, "gemini");
  assert.equal(metadata.structuredModel, "gemini-test");
  assert.equal(metadata.responseProvider, "local");
  assert.equal(metadata.responseModel, "local-rules-v1");
  assert.equal(metadata.provider, "local");
  assert.equal(metadata.fallbackFrom, "gemini");
  assert.equal(metadata.fallbackOperation, "recommendation_text");
  assert.equal(metadata.fallbackReason, "Provider request timed out.");
});

test("Gemini recommendation timeout uses longer recommendation-specific timeout", async () => {
  let calls = 0;
  const provider = createProvider(
    () => {
      calls += 1;

      if (calls === 1) {
        return Promise.resolve(geminiTextResponse(JSON.stringify(validIntent)));
      }

      return new Promise<Response>((resolve) => {
        setTimeout(() => {
          resolve(geminiTextResponse("NeuralBook X15 is the grounded fit."));
        }, 30);
      });
    },
    "test-gemini-api-key",
    {
      structuredTimeoutMs: 10,
      recommendationTimeoutMs: 80,
    },
  );

  await provider.generateStructuredOutput(baseInput);
  const text = await provider.generateText(catalogInput);

  assert.equal(calls, 2);
  assert.match(text, /NeuralBook X15/);
  assert.equal(provider.getMetadata().provider, "gemini");
});

test("Gemini recommendation can succeed when structured extraction falls back", async () => {
  let calls = 0;
  const provider = createProvider(
    () => {
      calls += 1;

      if (calls === 1) {
        return new Promise<Response>((_resolve, reject) => {
          setTimeout(() => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          }, 0);
        });
      }

      return Promise.resolve(geminiTextResponse("NeuralBook X15 is the grounded fit."));
    },
    "test-gemini-api-key",
    {
      structuredTimeoutMs: 10,
      recommendationTimeoutMs: 80,
      structuredModel: "gemini-3.5-flash-lite",
    },
  );

  const extracted = await provider.generateStructuredOutput(baseInput);
  const text = await provider.generateText({ ...catalogInput, intent: extracted });
  const metadata = provider.getMetadata();

  assert.equal(extracted.category, "laptop");
  assert.match(text, /NeuralBook X15/);
  assert.equal(metadata.structuredProvider, "local");
  assert.equal(metadata.structuredModel, "local-rules-v1");
  assert.equal(metadata.structuredFallbackFrom, "gemini");
  assert.equal(metadata.responseProvider, "gemini");
  assert.equal(metadata.responseModel, "gemini-test");
});

test("Gemini compact recommendation prompt keeps only needed request, context, and top catalog facts", () => {
  const prompt = buildRecommendationPrompt({
    ...catalogInput,
    latestCustomerMessage: "Compare the top two for me.",
    catalogResults: [
      ...catalogInput.catalogResults,
      {
        ...catalogInput.catalogResults[0],
        productId: "product-3",
        name: "CreatorBook 16",
      },
      {
        ...catalogInput.catalogResults[0],
        productId: "product-4",
        name: "StudioBook 15",
      },
      {
        ...catalogInput.catalogResults[0],
        productId: "product-5",
        name: "ExtraBook 13",
      },
    ],
  });
  const parsed = JSON.parse(prompt);

  assert.equal(parsed.latestCustomerMessage, "Compare the top two for me.");
  assert.equal(parsed.knownContext.category, "laptop");
  assert.equal(parsed.catalogResults.length, 4);
  assert.equal(parsed.catalogResults[0].tags, undefined);
  assert.equal(parsed.catalogResults[0].useCases, undefined);
  assert.equal(parsed.catalogResults[0].specifications.graphics, "NVIDIA RTX 4050");
  assert.equal(parsed.catalogResults[0].matchReasons, undefined);
  assert.equal(prompt.includes("priority preference match"), false);
  assert.equal(prompt.includes("ExtraBook 13"), false);
});

test("Gemini absent-product recommendation is rejected and falls back", async () => {
  const provider = createProvider(async () =>
    geminiTextResponse("GhostBook Pro is the better fit for AI workloads."),
  );

  const text = await provider.generateText(catalogInput);

  assert.match(text, /NeuralBook X15/);
  assert.doesNotMatch(text, /GhostBook Pro/);
  assert.equal(provider.getMetadata().provider, "local");
});

test("Gemini fallback metadata contains no secret", async () => {
  const secret = "secret-gemini-key-value-should-not-leak";
  const provider = createProvider(async () => {
    throw new Error(`request failed https://example.test?key=${secret}`);
  }, secret);

  await provider.generateStructuredOutput(baseInput);

  const serializedMetadata = JSON.stringify(provider.getMetadata());
  assert.equal(serializedMetadata.includes(secret), false);
});

test("Gemini API key never appears in provider errors", async () => {
  const secret = "another-secret-gemini-key-value-should-not-leak";
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  const provider = createProvider(async () =>
    jsonResponse(
      {
        error: {
          code: 401,
          status: "UNAUTHENTICATED",
          message: `bad key ${secret}`,
        },
      },
      401,
    ), secret);

  try {
    await provider.generateStructuredOutput(baseInput);
  } finally {
    console.warn = originalWarn;
  }

  const fallbackReason = provider.getMetadata().fallbackReason ?? "";
  const serializedWarnings = JSON.stringify(warnings);
  assert.equal(fallbackReason.includes(secret), false);
  assert.equal(serializedWarnings.includes(secret), false);
});
