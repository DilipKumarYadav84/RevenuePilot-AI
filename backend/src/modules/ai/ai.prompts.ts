import type {
  AssistantResponseInput,
  CatalogResult,
  IntentExtractionInput,
} from "./ai.types";

export const AI_PROMPT_VERSION = "revenuepilot-ai-v1";

export const INTENT_EXTRACTION_SYSTEM_PROMPT = [
  "You are RevenuePilot AI's extraction adapter.",
  "Return only the supported JSON fields requested by schema.",
  "Preserve known context unless the customer clearly updates it.",
  "A stated budget alone, such as asking for a laptop under Rs. 70,000, is not price hesitation and should remain browsing with null priceSensitivity.",
  "Use hesitating only for explicit concern, uncertainty, or price objection.",
  "Do not invent products, discounts, payments, offers, policies, or checkout actions.",
].join(" ");

export const INTENT_REPAIR_SYSTEM_PROMPT = [
  INTENT_EXTRACTION_SYSTEM_PROMPT,
  "Your previous response was invalid. Return strict JSON only, with no markdown.",
].join(" ");

export const RECOMMENDATION_SYSTEM_PROMPT = [
  "You are RevenuePilot AI's customer-facing catalog explainer.",
  "Use only the supplied catalog result facts.",
  "Do not invent product names, prices, specs, stock, discounts, payment status, or policy decisions.",
  "When discussing trade-offs such as battery life versus GPU power, only use facts present in the supplied catalog results.",
  "If no catalog result is supplied, say no suitable active TechNova product was found.",
  "Keep the response concise and helpful.",
  "Respond in clean plain text only: no Markdown syntax such as **bold**, # headings, bullet/numbered lists, or backtick code formatting, since the customer chat UI renders your response as plain text and any Markdown characters would show up literally.",
].join(" ");

const compactCatalogResult = (result: CatalogResult) => ({
  name: result.name,
  price: result.price,
  specifications: {
    processor: result.specifications.processor,
    graphics: result.specifications.graphics,
    ram: result.specifications.ram,
    storage: result.specifications.storage,
    battery: result.specifications.battery,
    display: result.specifications.display,
  },
  matchReasons: result.matchReasons.slice(0, 3),
});

export const buildIntentExtractionPrompt = (
  input: IntentExtractionInput,
): string =>
  JSON.stringify({
    promptVersion: AI_PROMPT_VERSION,
    latestCustomerMessage: input.latestCustomerMessage,
    recentMessages: input.recentMessages.slice(-6),
    knownContext: input.currentContext,
    outputContract: {
      intent: ["product_search", "general_question", "unknown"],
      category: [
        "laptop",
        "monitor",
        "keyboard",
        "mouse",
        "headphones",
        "accessory",
        null,
      ],
      budget: "number or null, in rupees",
      useCases: "string array",
      preferences: "string array",
      priceSensitivity: ["low", "medium", "high", null],
      purchaseIntent: ["low", "medium", "high", null],
      abandonmentRisk: ["low", "medium", "high", null],
      customerState: [
        "browsing",
        "comparing",
        "hesitating",
        "ready_to_buy",
        "unknown",
      ],
    },
  });

export const buildRecommendationPrompt = (
  input: AssistantResponseInput,
): string =>
  JSON.stringify({
    promptVersion: AI_PROMPT_VERSION,
    latestCustomerMessage: input.latestCustomerMessage,
    knownContext: {
      category: input.intent.category,
      budget: input.intent.budget,
      useCases: input.intent.useCases,
      preferences: input.intent.preferences,
      priceSensitivity: input.intent.priceSensitivity,
      purchaseIntent: input.intent.purchaseIntent,
      customerState: input.intent.customerState,
    },
    catalogResults: input.catalogResults.slice(0, 4).map(compactCatalogResult),
  });
