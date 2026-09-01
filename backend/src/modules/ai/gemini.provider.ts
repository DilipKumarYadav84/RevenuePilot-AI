import {
  RECOMMENDATION_AI_TIMEOUT_MS,
  STRUCTURED_AI_TIMEOUT_MS,
  isGroundedRecommendationText,
  logSafeProviderFailure,
  parseStructuredIntent,
  safeFailureReason,
  withTimeout,
} from "./ai-provider-utils";
import {
  INTENT_EXTRACTION_SYSTEM_PROMPT,
  INTENT_REPAIR_SYSTEM_PROMPT,
  RECOMMENDATION_SYSTEM_PROMPT,
  buildIntentExtractionPrompt,
  buildRecommendationPrompt,
} from "./ai.prompts";
import type {
  AIProvider,
  AIProviderMetadata,
  AssistantResponseInput,
  IntentExtractionInput,
  StructuredIntent,
} from "./ai.types";

type Fetcher = typeof fetch;

type GeminiProviderConfig = {
  apiKey: string;
  model: string;
  structuredModel?: string | undefined;
  fallbackProvider: AIProvider;
  timeoutMs?: number | undefined;
  structuredTimeoutMs?: number | undefined;
  recommendationTimeoutMs?: number | undefined;
  fetcher?: Fetcher | undefined;
};

type GeminiPart = {
  text?: string;
};

type GeminiCandidate = {
  content?: {
    parts?: GeminiPart[];
  };
  finishReason?: string;
};

type GeminiResponsePayload = {
  candidates?: GeminiCandidate[];
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    code?: number;
    status?: string;
    message?: string;
  };
};

const GEMINI_GENERATE_CONTENT_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

const geminiStructuredIntentSchema = {
  type: "OBJECT",
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
      type: "STRING",
      enum: ["product_search", "general_question", "unknown"],
    },
    category: {
      type: "STRING",
      enum: [
        "laptop",
        "monitor",
        "keyboard",
        "mouse",
        "headphones",
        "accessory",
      ],
      nullable: true,
    },
    budget: {
      type: "NUMBER",
      nullable: true,
    },
    useCases: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    preferences: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    priceSensitivity: {
      type: "STRING",
      enum: ["low", "medium", "high"],
      nullable: true,
    },
    purchaseIntent: {
      type: "STRING",
      enum: ["low", "medium", "high"],
      nullable: true,
    },
    abandonmentRisk: {
      type: "STRING",
      enum: ["low", "medium", "high"],
      nullable: true,
    },
    customerState: {
      type: "STRING",
      enum: ["browsing", "comparing", "hesitating", "ready_to_buy", "unknown"],
    },
  },
} as const;

const buildGeminiUrl = (model: string, apiKey: string): string =>
  `${GEMINI_GENERATE_CONTENT_BASE_URL}/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

const buildRequest = (
  systemPrompt: string,
  userPrompt: string,
  structured: boolean,
  thinkingLevel: "low",
) => ({
  systemInstruction: {
    parts: [{ text: systemPrompt }],
  },
  contents: [
    {
      role: "user",
      parts: [{ text: userPrompt }],
    },
  ],
  generationConfig: {
    temperature: structured ? 0 : 0.4,
    thinkingConfig: {
      thinkingLevel,
    },
    ...(structured
      ? {
          responseMimeType: "application/json",
          responseSchema: geminiStructuredIntentSchema,
        }
      : {}),
  },
});

const getGeminiOutputText = (payload: GeminiResponsePayload): string => {
  if (payload.promptFeedback?.blockReason) {
    throw new Error(`Gemini response blocked: ${payload.promptFeedback.blockReason}`);
  }

  const candidate = payload.candidates?.[0];

  if (!candidate) {
    throw new Error("Gemini response did not include candidates.");
  }

  if (
    candidate.finishReason &&
    ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"].includes(
      candidate.finishReason,
    )
  ) {
    throw new Error(`Gemini response blocked: ${candidate.finishReason}`);
  }

  const text = candidate.content?.parts
    ?.map((part) => part.text)
    .filter((partText): partText is string => Boolean(partText?.trim()))
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini response did not include output text.");
  }

  return text;
};

const getGeminiErrorReason = (
  status: number,
  payload: GeminiResponsePayload,
): string => {
  const providerStatus = payload.error?.status;
  const providerCode = payload.error?.code;
  const providerMessage = payload.error?.message;
  const details = [providerStatus, providerCode, providerMessage]
    .filter(Boolean)
    .join(" ");

  return details ? `HTTP ${status} ${details}` : `HTTP ${status}`;
};

export const createGeminiProvider = ({
  apiKey,
  model,
  structuredModel = model,
  fallbackProvider,
  timeoutMs,
  structuredTimeoutMs = timeoutMs ?? STRUCTURED_AI_TIMEOUT_MS,
  recommendationTimeoutMs = timeoutMs ?? RECOMMENDATION_AI_TIMEOUT_MS,
  fetcher = fetch,
}: GeminiProviderConfig): AIProvider => {
  let metadata: AIProviderMetadata = {
    provider: "gemini",
    model,
  };
  let lastStructuredMetadata: AIProviderMetadata | null = null;

  const markFallback = (
    operation: "structured_output" | "recommendation_text",
    reason: string,
  ): void => {
    metadata = {
      provider: fallbackProvider.name,
      model: fallbackProvider.model,
      fallbackProvider: "gemini",
      fallbackReason: reason,
      fallbackFrom: "gemini",
      fallbackOperation: operation,
      ...(operation === "structured_output"
        ? {
            structuredFallbackFrom: "gemini",
            structuredFallbackReason: reason,
          }
        : {
            responseFallbackFrom: "gemini",
            responseFallbackReason: reason,
          }),
      ...(operation === "recommendation_text" && lastStructuredMetadata
        ? {
            structuredProvider: lastStructuredMetadata.provider,
            structuredModel: lastStructuredMetadata.model,
            responseProvider: fallbackProvider.name,
            responseModel: fallbackProvider.model,
          }
        : {}),
    };
    logSafeProviderFailure("gemini", operation, reason);
  };

  const requestGeminiText = async (
    requestModel: string,
    systemPrompt: string,
    userPrompt: string,
    structured: boolean,
    timeoutMsForOperation: number,
  ): Promise<string> => {
    if (!apiKey) {
      throw new Error("AI_API_KEY is missing.");
    }

    const payload = await withTimeout(timeoutMsForOperation, async (signal) => {
      const response = await fetcher(buildGeminiUrl(requestModel, apiKey), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildRequest(systemPrompt, userPrompt, structured, "low")),
        signal,
      });
      const responsePayload = (await response.json().catch(() => ({}))) as GeminiResponsePayload;

      if (!response.ok) {
        throw new Error(getGeminiErrorReason(response.status, responsePayload));
      }

      if (responsePayload.error) {
        throw new Error(getGeminiErrorReason(responsePayload.error.code ?? 500, responsePayload));
      }

      return responsePayload;
    });

    return getGeminiOutputText(payload);
  };

  return {
    name: "gemini",
    model,
    getMetadata: () => metadata,
    async generateStructuredOutput(
      input: IntentExtractionInput,
    ): Promise<StructuredIntent> {
      metadata = { provider: "gemini", model: structuredModel };

      try {
        const initialText = await requestGeminiText(
          structuredModel,
          INTENT_EXTRACTION_SYSTEM_PROMPT,
          buildIntentExtractionPrompt(input),
          true,
          structuredTimeoutMs,
        );

        try {
          const parsed = parseStructuredIntent(initialText);
          lastStructuredMetadata = { provider: "gemini", model: structuredModel };
          return parsed;
        } catch {
          const repairedText = await requestGeminiText(
            structuredModel,
            INTENT_REPAIR_SYSTEM_PROMPT,
            buildIntentExtractionPrompt(input),
            true,
            structuredTimeoutMs,
          );
          const parsed = parseStructuredIntent(repairedText);
          lastStructuredMetadata = { provider: "gemini", model: structuredModel };
          return parsed;
        }
      } catch (error) {
        const reason = safeFailureReason(error, apiKey);
        markFallback("structured_output", reason);
        const fallbackIntent = await fallbackProvider.generateStructuredOutput(input);
        lastStructuredMetadata = {
          provider: fallbackProvider.name,
          model: fallbackProvider.model,
          fallbackProvider: "gemini",
          fallbackReason: reason,
          fallbackFrom: "gemini",
          fallbackOperation: "structured_output",
          structuredFallbackFrom: "gemini",
          structuredFallbackReason: reason,
        };
        return fallbackIntent;
      }
    },
    async generateText(input: AssistantResponseInput): Promise<string> {
      metadata = { provider: "gemini", model };

      try {
        const text = await requestGeminiText(
          model,
          RECOMMENDATION_SYSTEM_PROMPT,
          buildRecommendationPrompt(input),
          false,
          recommendationTimeoutMs,
        );

        if (!isGroundedRecommendationText(text, input)) {
          throw new Error("Gemini recommendation text was not grounded in catalog results.");
        }

        metadata = {
          provider: "gemini",
          model,
          ...(lastStructuredMetadata
            ? {
                structuredProvider: lastStructuredMetadata.provider,
                structuredModel: lastStructuredMetadata.model,
                structuredFallbackFrom:
                  lastStructuredMetadata.structuredFallbackFrom ??
                  lastStructuredMetadata.fallbackFrom,
                structuredFallbackReason:
                  lastStructuredMetadata.structuredFallbackReason ??
                  lastStructuredMetadata.fallbackReason,
              }
            : {}),
          responseProvider: "gemini",
          responseModel: model,
        };

        return text;
      } catch (error) {
        const reason = safeFailureReason(error, apiKey);
        markFallback("recommendation_text", reason);
        return fallbackProvider.generateText(input);
      }
    },
  };
};
