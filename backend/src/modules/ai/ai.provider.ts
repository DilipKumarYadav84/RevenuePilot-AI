import { env } from "../../config/env";
import { structuredIntentSchema } from "./ai.schemas";
import type {
  AIProvider,
  AssistantResponseInput,
  IntentExtractionInput,
  StructuredIntent,
} from "./ai.types";
import { extractIntentLocally } from "./intent.service";
import { createGeminiProvider } from "./gemini.provider";
import { createOpenAIProvider } from "./openai.provider";

export class AIProviderError extends Error {
  statusCode = 503;
}

const formatPrice = (price: number): string =>
  `Rs. ${new Intl.NumberFormat("en-IN").format(price)}`;

const getSpec = (
  specifications: Record<string, string>,
  key: string,
): string | undefined => specifications[key];

const buildGroundedResponse = ({
  catalogResults,
}: AssistantResponseInput): string => {
  if (catalogResults.length === 0) {
    return "I could not find a suitable active TechNova product for that request. You can adjust the budget, category, or priority and I can try again.";
  }

  const topResult = catalogResults[0];
  const secondResult = catalogResults[1];

  if (!topResult) {
    return "I could not find a suitable active TechNova product for that request. You can adjust the budget, category, or priority and I can try again.";
  }

  const topFacts = [
    getSpec(topResult.specifications, "processor"),
    getSpec(topResult.specifications, "graphics"),
    getSpec(topResult.specifications, "ram"),
    getSpec(topResult.specifications, "battery"),
  ].filter(Boolean);

  const responseParts = [
    `The ${topResult.name} is the strongest catalog match at ${formatPrice(
      topResult.price,
    )}.`,
  ];

  if (topFacts.length > 0) {
    responseParts.push(`Key fit: ${topFacts.join(", ")}.`);
  }

  if (topResult.matchReasons.length > 0) {
    responseParts.push(`Why it matched: ${topResult.matchReasons.join("; ")}.`);
  }

  if (secondResult) {
    responseParts.push(
      `A useful alternative is ${secondResult.name} at ${formatPrice(
        secondResult.price,
      )}, especially if its trade-offs fit your priorities better.`,
    );
  }

  return responseParts.join(" ");
};

export const createLocalAIProvider = (
  model = env.AI_PROVIDER === "local" ? env.AI_MODEL : "local-rules-v1",
): AIProvider => ({
  name: "local",
  model,
  getMetadata: () => ({
    provider: "local",
    model,
  }),
  async generateStructuredOutput(
    input: IntentExtractionInput,
  ): Promise<StructuredIntent> {
    const extractedIntent = extractIntentLocally(input);
    return structuredIntentSchema.parse(extractedIntent);
  },
  async generateText(input: AssistantResponseInput): Promise<string> {
    return buildGroundedResponse(input);
  },
});

const localProvider = createLocalAIProvider();

export const getAIProvider = (): AIProvider => {
  if (env.AI_PROVIDER === "local" || env.AI_PROVIDER.length === 0) {
    return localProvider;
  }

  if (env.AI_PROVIDER === "openai") {
    return createOpenAIProvider({
      apiKey: env.AI_API_KEY,
      model: env.AI_MODEL === "local-rules-v1" ? "gpt-4.1-mini" : env.AI_MODEL,
      fallbackProvider: createLocalAIProvider("local-rules-v1"),
    });
  }

  if (env.AI_PROVIDER === "gemini") {
    const geminiModel =
      env.AI_MODEL === "local-rules-v1" ? "gemini-3.6-flash" : env.AI_MODEL;

    return createGeminiProvider({
      apiKey: env.AI_API_KEY,
      model: geminiModel,
      structuredModel: env.AI_STRUCTURED_MODEL || geminiModel,
      fallbackProvider: createLocalAIProvider("local-rules-v1"),
    });
  }

  throw new AIProviderError(
    `AI provider "${env.AI_PROVIDER}" is not supported. Use "local", "openai", or "gemini".`,
  );
};
