import {
  RECOMMENDATION_AI_TIMEOUT_MS,
  STRUCTURED_AI_TIMEOUT_MS,
  isGroundedRecommendationText,
  logSafeProviderFailure,
  parseStructuredIntent,
  safeFailureReason,
  structuredIntentJsonSchema,
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

type OpenAIProviderConfig = {
  apiKey: string;
  model: string;
  fallbackProvider: AIProvider;
  timeoutMs?: number | undefined;
  structuredTimeoutMs?: number | undefined;
  recommendationTimeoutMs?: number | undefined;
  fetcher?: Fetcher | undefined;
};

type OpenAIResponseContent = {
  type?: string;
  text?: string;
};

type OpenAIResponseOutput = {
  content?: OpenAIResponseContent[];
};

type OpenAIResponsePayload = {
  output_text?: string;
  output?: OpenAIResponseOutput[];
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const getOpenAIOutputText = (payload: OpenAIResponsePayload): string => {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text" && typeof content.text === "string")
    ?.text;

  if (typeof text === "string") {
    return text;
  }

  throw new Error("OpenAI response did not include output text.");
};

const buildRequest = (
  model: string,
  systemPrompt: string,
  userPrompt: string,
  structured: boolean,
) => ({
  model,
  input: [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: userPrompt,
    },
  ],
  ...(structured
    ? {
        text: {
          format: {
            type: "json_schema",
            name: "revenuepilot_intent",
            strict: true,
            schema: structuredIntentJsonSchema,
          },
        },
      }
    : {}),
});

export const createOpenAIProvider = ({
  apiKey,
  model,
  fallbackProvider,
  timeoutMs,
  structuredTimeoutMs = timeoutMs ?? STRUCTURED_AI_TIMEOUT_MS,
  recommendationTimeoutMs = timeoutMs ?? RECOMMENDATION_AI_TIMEOUT_MS,
  fetcher = fetch,
}: OpenAIProviderConfig): AIProvider => {
  let metadata: AIProviderMetadata = {
    provider: "openai",
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
      fallbackProvider: "openai",
      fallbackReason: reason,
      fallbackFrom: "openai",
      fallbackOperation: operation,
      ...(operation === "structured_output"
        ? {
            structuredFallbackFrom: "openai",
            structuredFallbackReason: reason,
          }
        : {
            responseFallbackFrom: "openai",
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
    logSafeProviderFailure("openai", operation, reason);
  };

  const requestOpenAIText = async (
    systemPrompt: string,
    userPrompt: string,
    structured: boolean,
    timeoutMsForOperation: number,
  ): Promise<string> => {
    if (!apiKey) {
      throw new Error("AI_API_KEY is missing.");
    }

    const payload = await withTimeout(timeoutMsForOperation, async (signal) => {
      const response = await fetcher(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildRequest(model, systemPrompt, userPrompt, structured)),
        signal,
      });
      const responsePayload = (await response.json().catch(() => ({}))) as OpenAIResponsePayload;

      if (!response.ok) {
        throw new Error(
          responsePayload.error?.code ??
            responsePayload.error?.type ??
            `HTTP ${response.status}`,
        );
      }

      if (responsePayload.error) {
        throw new Error(responsePayload.error.code ?? responsePayload.error.type ?? "OpenAI error");
      }

      return responsePayload;
    });

    return getOpenAIOutputText(payload);
  };

  return {
    name: "openai",
    model,
    getMetadata: () => metadata,
    async generateStructuredOutput(
      input: IntentExtractionInput,
    ): Promise<StructuredIntent> {
      metadata = { provider: "openai", model };

      try {
        const initialText = await requestOpenAIText(
          INTENT_EXTRACTION_SYSTEM_PROMPT,
          buildIntentExtractionPrompt(input),
          true,
          structuredTimeoutMs,
        );

        try {
          const parsed = parseStructuredIntent(initialText);
          lastStructuredMetadata = { provider: "openai", model };
          return parsed;
        } catch {
          const repairedText = await requestOpenAIText(
            INTENT_REPAIR_SYSTEM_PROMPT,
            buildIntentExtractionPrompt(input),
            true,
            structuredTimeoutMs,
          );
          const parsed = parseStructuredIntent(repairedText);
          lastStructuredMetadata = { provider: "openai", model };
          return parsed;
        }
      } catch (error) {
        const reason = safeFailureReason(error, apiKey);
        markFallback("structured_output", reason);
        const fallbackIntent = await fallbackProvider.generateStructuredOutput(input);
        lastStructuredMetadata = {
          provider: fallbackProvider.name,
          model: fallbackProvider.model,
          fallbackProvider: "openai",
          fallbackReason: reason,
          fallbackFrom: "openai",
          fallbackOperation: "structured_output",
          structuredFallbackFrom: "openai",
          structuredFallbackReason: reason,
        };
        return fallbackIntent;
      }
    },
    async generateText(input: AssistantResponseInput): Promise<string> {
      metadata = { provider: "openai", model };

      try {
        const text = await requestOpenAIText(
          RECOMMENDATION_SYSTEM_PROMPT,
          buildRecommendationPrompt(input),
          false,
          recommendationTimeoutMs,
        );

        if (!isGroundedRecommendationText(text, input)) {
          throw new Error("OpenAI recommendation text was not grounded in catalog results.");
        }

        metadata = {
          provider: "openai",
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
          responseProvider: "openai",
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

export { isGroundedRecommendationText };
