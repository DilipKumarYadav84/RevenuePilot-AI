import { isDevelopment } from "../../config/env";
import { structuredIntentSchema } from "./ai.schemas";
import type { AssistantResponseInput, StructuredIntent } from "./ai.types";

export const STRUCTURED_AI_TIMEOUT_MS = 8000;
export const RECOMMENDATION_AI_TIMEOUT_MS = 12000;

export const structuredIntentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "category",
    "budget",
    "useCases",
    "preferences",
    "priceSensitivity",
    "purchaseIntent",
    "abandonmentRisk",
    "customerState",
  ],
  properties: {
    intent: {
      type: "string",
      enum: ["product_search", "general_question", "unknown"],
    },
    category: {
      anyOf: [
        {
          type: "string",
          enum: [
            "laptop",
            "monitor",
            "keyboard",
            "mouse",
            "headphones",
            "accessory",
          ],
        },
        { type: "null" },
      ],
    },
    budget: {
      anyOf: [{ type: "number", minimum: 0 }, { type: "null" }],
    },
    useCases: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    preferences: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    priceSensitivity: {
      anyOf: [
        { type: "string", enum: ["low", "medium", "high"] },
        { type: "null" },
      ],
    },
    purchaseIntent: {
      anyOf: [
        { type: "string", enum: ["low", "medium", "high"] },
        { type: "null" },
      ],
    },
    abandonmentRisk: {
      anyOf: [
        { type: "string", enum: ["low", "medium", "high"] },
        { type: "null" },
      ],
    },
    customerState: {
      type: "string",
      enum: ["browsing", "comparing", "hesitating", "ready_to_buy", "unknown"],
    },
  },
} as const;

const secretPatterns = [
  /AIza[0-9A-Za-z_-]{20,}/g,
  /key=([^&\s]+)/gi,
  /Authorization:\s*Bearer\s+[^\s,}]+/gi,
] as const;

export const sanitizeProviderReason = (
  reason: string,
  secret?: string,
): string => {
  let sanitized = reason;

  if (secret) {
    sanitized = sanitized.split(secret).join("[redacted]");
  }

  for (const pattern of secretPatterns) {
    sanitized = sanitized.replace(pattern, (match, value: string | undefined) =>
      value ? "key=[redacted]" : "[redacted]",
    );
  }

  return sanitized.length > 180 ? `${sanitized.slice(0, 177)}...` : sanitized;
};

export const safeFailureReason = (
  error: unknown,
  secret?: string,
): string => {
  const reason =
    error instanceof Error ? error.message : "Provider request failed.";
  return sanitizeProviderReason(reason, secret);
};

export const logSafeProviderFailure = (
  provider: string,
  operation: "structured_output" | "recommendation_text",
  reason: string,
): void => {
  if (!isDevelopment) {
    return;
  }

  console.warn("AI provider fallback:", {
    provider,
    operation,
    reason,
  });
};

export const withTimeout = async <T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await task(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Provider request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const parseStructuredIntent = (text: string): StructuredIntent => {
  const parsed = JSON.parse(text) as unknown;
  return structuredIntentSchema.parse(parsed);
};

const includesAnyAllowedProductName = (
  text: string,
  allowedNames: string[],
): boolean => allowedNames.some((name) => text.includes(name));

const hasLikelyUnknownProductName = (
  text: string,
  allowedNames: string[],
): boolean => {
  const withoutAllowedNames = allowedNames.reduce(
    (current, name) => current.replaceAll(name, ""),
    text,
  );

  return /\b[A-Z][A-Za-z]+(?:Book|View|Board|Mouse|Sound|Dock|Stand)\s+[A-Z0-9][A-Za-z0-9-]*\b/.test(
    withoutAllowedNames,
  );
};

export const isGroundedRecommendationText = (
  text: string,
  input: AssistantResponseInput,
): boolean => {
  if (input.catalogResults.length === 0) {
    return true;
  }

  const allowedNames = input.catalogResults.map((result) => result.name);

  return (
    includesAnyAllowedProductName(text, allowedNames) &&
    !hasLikelyUnknownProductName(text, allowedNames)
  );
};
