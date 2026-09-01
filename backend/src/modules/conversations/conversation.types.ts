import type { Types } from "mongoose";

import type { ProductCategory } from "../products/product.model";

export type ConversationStatus = "active" | "converted" | "abandoned" | "closed";

export type ConversationMessageRole = "customer" | "assistant" | "system" | "tool";

export type ConversationMessageMetadata = Record<string, unknown>;

export type ConversationMessage = {
  role: ConversationMessageRole;
  content: string;
  timestamp: Date;
  metadata?: ConversationMessageMetadata | undefined;
};

export type PriceSensitivity = "low" | "medium" | "high" | null;

export type PurchaseIntent = "low" | "medium" | "high" | null;

export type AbandonmentRisk = "low" | "medium" | "high" | null;

export type CustomerState =
  | "browsing"
  | "comparing"
  | "hesitating"
  | "ready_to_buy"
  | "unknown";

export type ExtractedConversationContext = {
  intent?: string | null | undefined;
  category?: ProductCategory | null | undefined;
  budget?: number | null | undefined;
  useCases?: string[] | undefined;
  preferences?: string[] | undefined;
  // The subset of `preferences` explicitly (re)stated by the customer in
  // their most recent message, as opposed to preferences merely carried
  // over from earlier turns. Used to give the customer's freshest,
  // explicitly-restated preference materially more weight in catalog
  // ranking — see product.service.ts's PRIORITY_PREFERENCE_WEIGHT.
  priorityPreferences?: string[] | undefined;
  priceSensitivity?: PriceSensitivity | undefined;
  purchaseIntent?: PurchaseIntent | undefined;
  abandonmentRisk?: AbandonmentRisk | undefined;
  customerState?: CustomerState | undefined;
  lastUpdatedAt?: Date | null | undefined;
};

export type Conversation = {
  sessionId: string;
  customerId?: string | undefined;
  status: ConversationStatus;
  messages: ConversationMessage[];
  extractedContext: ExtractedConversationContext;
  recommendedProductIds: Types.ObjectId[];
  selectedProductId?: Types.ObjectId | undefined;
  createdAt?: Date;
  updatedAt?: Date;
};

export type CreateConversationInput = {
  sessionId?: string | undefined;
  customerId?: string | undefined;
  extractedContext?: ExtractedConversationContext | undefined;
};

export type AppendMessageInput = {
  role: ConversationMessageRole;
  content: string;
  metadata?: ConversationMessageMetadata | undefined;
};
