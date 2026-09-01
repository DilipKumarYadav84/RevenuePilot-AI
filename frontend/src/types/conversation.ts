import type { Offer, PaymentStatus } from "./payment";

export type ConversationMessageRole = "customer" | "assistant" | "system" | "tool";

export type CustomerState =
  | "browsing"
  | "comparing"
  | "hesitating"
  | "ready_to_buy"
  | "unknown";

export type ExtractedConversationContext = {
  intent?: string | null;
  category?: string | null;
  budget?: number | null;
  useCases?: string[];
  preferences?: string[];
  priorityPreferences?: string[];
  priceSensitivity?: "low" | "medium" | "high" | null;
  purchaseIntent?: "low" | "medium" | "high" | null;
  abandonmentRisk?: "low" | "medium" | "high" | null;
  customerState?: CustomerState;
  lastUpdatedAt?: string | null;
};

export type ConversationMessage = {
  role: ConversationMessageRole;
  content: string;
  timestamp?: string;
};

export type Conversation = {
  _id?: string;
  sessionId: string;
  status: "active" | "converted" | "abandoned" | "closed";
  messages: ConversationMessage[];
  extractedContext: ExtractedConversationContext;
  recommendedProductIds: string[];
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

export type ActionProposal = {
  action:
    | "CREATE_DISCOUNT"
    | "CREATE_BUNDLE"
    | "RECOMMEND_ALTERNATIVE"
    | "START_CHECKOUT"
    | "EXPLAIN_VALUE"
    | "NO_ACTION";
  conversationId?: string;
  productId?: string;
  orderValue?: number;
  requestedDiscountPercent?: number;
  reason?: string;
};

export type PolicyDecision = {
  decision: "APPROVED" | "MODIFIED" | "BLOCKED" | "REQUIRES_APPROVAL";
  requestedAction: ActionProposal;
  approvedAction: {
    action: ActionProposal["action"];
    approvedDiscountPercent?: number;
  } | null;
  reason: string;
  requiresHumanApproval: boolean;
};

export type ProcessConversationResult = {
  conversationId: string;
  extractedContext: ExtractedConversationContext;
  recommendedProductIds: string[];
  proposedAction: ActionProposal;
  policyDecision: PolicyDecision;
  assistantMessage: {
    role: "assistant";
    content: string;
  };
  catalogResults: CatalogResult[];
};

export type CreateOfferResult = {
  executed: boolean;
  offer: Offer | null;
  policyDecision: PolicyDecision;
};

export type JourneyStepState = "idle" | "active" | "done" | "blocked";

export type PaymentSummary = {
  status: PaymentStatus;
  amount: number;
};
