import type { ProductCategory } from "../products/product.model";
import type { ActionProposal, PolicyDecision } from "../policies/policy.types";

export type AIIntent = "product_search" | "general_question" | "unknown";

export type StructuredIntent = {
  intent: AIIntent;
  category: ProductCategory | null;
  budget: number | null;
  useCases: string[];
  preferences: string[];
  priceSensitivity: "low" | "medium" | "high" | null;
  purchaseIntent: "low" | "medium" | "high" | null;
  abandonmentRisk: "low" | "medium" | "high" | null;
  customerState:
    | "browsing"
    | "comparing"
    | "hesitating"
    | "ready_to_buy"
    | "unknown";
};

// The subset of `preferences` explicitly (re)stated in the customer's most
// recent message, as opposed to preferences merely carried over from
// earlier turns — computed by mergeExtractedIntent() in intent.service.ts.
// Kept off StructuredIntent itself (the raw per-turn AI-extraction
// contract) since no provider needs to know about it; it only exists on
// the merged, cross-turn conversation context.
export type MergedIntent = StructuredIntent & {
  priorityPreferences: string[];
};

export type AIConversationMessage = {
  role: "customer" | "assistant";
  content: string;
};

export type IntentExtractionInput = {
  latestCustomerMessage: string;
  recentMessages: AIConversationMessage[];
  currentContext: Partial<StructuredIntent>;
};

export type CatalogSearchInput = {
  category?: ProductCategory | undefined;
  budget?: number | undefined;
  useCases?: string[] | undefined;
  preferences?: string[] | undefined;
  priorityPreferences?: string[] | undefined;
};

export type CatalogResult = {
  productId: string;
  name: string;
  price: number;
  specifications: Record<string, string>;
  tags: string[];
  useCases: string[];
  matchScore: number;
  matchReasons: string[];
};

export type AssistantResponseInput = {
  intent: StructuredIntent;
  catalogResults: CatalogResult[];
  latestCustomerMessage?: string | undefined;
  responseMode?: "DISCOVERY" | "COMPARISON" | "HESITATION_POLICY_RESULT" | "ACTIVE_OFFER" | "OFFER_ACCEPTED" | "CHECKOUT_READY" | "PAYMENT_VERIFIED" | undefined;
  commerceState?: string | undefined;
};

export type AIProviderMetadata = {
  provider: string;
  model: string;
  fallbackProvider?: string | undefined;
  fallbackReason?: string | undefined;
  structuredProvider?: string | undefined;
  structuredModel?: string | undefined;
  responseProvider?: string | undefined;
  responseModel?: string | undefined;
  fallbackFrom?: string | undefined;
  fallbackOperation?: "structured_output" | "recommendation_text" | undefined;
  structuredFallbackFrom?: string | undefined;
  structuredFallbackReason?: string | undefined;
  responseFallbackFrom?: string | undefined;
  responseFallbackReason?: string | undefined;
};

export type AIProvider = {
  name: string;
  model: string;
  generateStructuredOutput: (
    input: IntentExtractionInput,
  ) => Promise<StructuredIntent>;
  generateText: (input: AssistantResponseInput) => Promise<string>;
  getMetadata: () => AIProviderMetadata;
};

export type OrchestratorResult = {
  conversationId: string;
  extractedContext: StructuredIntent;
  recommendedProductIds: string[];
  proposedAction: ActionProposal;
  policyDecision: PolicyDecision;
  assistantMessage: {
    role: "assistant";
    content: string;
  };
  catalogResults: CatalogResult[];
};
