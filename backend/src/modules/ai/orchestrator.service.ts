import {
  appendMessage,
  getConversationById,
  setRecommendedProducts,
  updateExtractedContext,
} from "../conversations/conversation.service";
import { isDevelopment } from "../../config/env";
import { createAuditEvent } from "../audit/audit.service";
import type {
  Conversation,
  ConversationMessage,
  ExtractedConversationContext,
} from "../conversations/conversation.types";
import { evaluateActionProposal } from "../policies/policy.service";
import { searchCatalog } from "./catalog.tool";
import { getAIProvider } from "./ai.provider";
import { structuredIntentSchema } from "./ai.schemas";
import type {
  AIConversationMessage,
  CatalogSearchInput,
  MergedIntent,
  OrchestratorResult,
  StructuredIntent,
} from "./ai.types";
import { extractIntentLocally, mergeExtractedIntent } from "./intent.service";
import { getFocusedCatalogResult, proposePolicyAction } from "./policy-proposal.service";
import { OfferModel } from "../offers/offer.model";
import { PaymentModel } from "../payments/payment.model";
import type { Offer } from "../offers/offer.types";
import type { PaymentRecord } from "../payments/payment.types";
import { buildCommerceResponse, deriveCommerceState } from "./commerce-state.service";

export class OrchestratorError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

const RECENT_MESSAGE_LIMIT = 8;
const MAX_RECOMMENDATIONS_TO_STORE = 4;
const MAX_RESULTS_FOR_RESPONSE = 4;

const toRecentMessages = (
  messages: ConversationMessage[],
): AIConversationMessage[] => {
  const recentMessages: AIConversationMessage[] = [];

  for (const message of messages) {
    if (message.role === "customer" || message.role === "assistant") {
      recentMessages.push({
        role: message.role,
        content: message.content,
      });
    }
  }

  return recentMessages.slice(-RECENT_MESSAGE_LIMIT);
};

const getLatestCustomerMessage = (
  conversation: Conversation,
): ConversationMessage | undefined =>
  [...conversation.messages]
    .reverse()
    .find((message) => message.role === "customer");

const compactContext = (
  context: ExtractedConversationContext,
): Partial<StructuredIntent> & { priorityPreferences?: string[] | undefined } => {
  const compacted: Partial<StructuredIntent> & { priorityPreferences?: string[] | undefined } = {
    category: context.category ?? null,
    budget: context.budget ?? null,
    useCases: context.useCases ?? [],
    preferences: context.preferences ?? [],
    priorityPreferences: context.priorityPreferences ?? [],
    priceSensitivity: context.priceSensitivity ?? null,
    purchaseIntent: context.purchaseIntent ?? null,
    abandonmentRisk: context.abandonmentRisk ?? null,
    customerState: context.customerState ?? "unknown",
  };

  if (
    context.intent === "product_search" ||
    context.intent === "general_question" ||
    context.intent === "unknown"
  ) {
    compacted.intent = context.intent;
  }

  return compacted;
};

export const toCatalogSearchInput = (
  intent: MergedIntent,
): CatalogSearchInput => {
  const input: CatalogSearchInput = {};

  if (intent.category) {
    input.category = intent.category;
  }

  if (typeof intent.budget === "number") {
    input.budget = intent.budget;
  }

  if (intent.useCases.length > 0) {
    input.useCases = intent.useCases;
  }

  if (intent.preferences.length > 0) {
    input.preferences = intent.preferences;
  }

  if ((intent.priorityPreferences ?? []).length > 0) {
    input.priorityPreferences = intent.priorityPreferences;
  }

  return input;
};

const validateStructuredIntent = (
  intent: StructuredIntent,
): StructuredIntent => structuredIntentSchema.parse(intent);

const elapsedMs = (startedAt: number): number => Date.now() - startedAt;

const unique = (values: string[]): string[] => [...new Set(values)];

const supplementWithLocalSignals = (
  extractedIntent: StructuredIntent,
  localIntent: StructuredIntent,
): StructuredIntent => ({
  ...extractedIntent,
  intent:
    extractedIntent.intent !== "unknown" ? extractedIntent.intent : localIntent.intent,
  category: extractedIntent.category ?? localIntent.category,
  budget: extractedIntent.budget ?? localIntent.budget,
  useCases: unique([...extractedIntent.useCases, ...localIntent.useCases]),
  preferences: unique([...extractedIntent.preferences, ...localIntent.preferences]),
});

export const processCustomerMessage = async (
  conversationId: string,
): Promise<OrchestratorResult> => {
  const totalStartedAt = Date.now();
  let structuredMs = 0;
  let catalogMs = 0;
  let recommendationMs = 0;
  const conversation = await getConversationById(conversationId);

  if (!conversation) {
    throw new OrchestratorError("Conversation not found", 404);
  }

  const latestCustomerMessage = getLatestCustomerMessage(conversation);

  if (!latestCustomerMessage) {
    throw new OrchestratorError("Conversation has no customer message to process", 400);
  }

  const provider = getAIProvider();
  const latestOffer = await OfferModel.findOne({ conversationId })
    .sort({ createdAt: -1, _id: -1 }).lean<Offer>().exec();
  // A payment only describes the offer that created its backend order; an
  // older verified payment must not override a newer conversation offer.
  const latestOfferId = latestOffer && "_id" in latestOffer ? String(latestOffer._id) : "";
  const latestPayment = latestOfferId
    ? await PaymentModel.findOne({ conversationId, offerId: latestOfferId })
      .sort({ createdAt: -1, _id: -1 }).lean<PaymentRecord>().exec()
    : null;
  const existingCommerceState = deriveCommerceState(latestOffer, latestPayment);
  const previousFocusedProductId = latestOffer?.productId ?? conversation.selectedProductId?.toString() ?? conversation.recommendedProductIds[0]?.toString();
  const currentContext = compactContext(conversation.extractedContext ?? {});
  const recentMessages = toRecentMessages(conversation.messages);

  const structuredStartedAt = Date.now();
  const extractedIntent = validateStructuredIntent(
    await provider.generateStructuredOutput({
      latestCustomerMessage: latestCustomerMessage.content,
      recentMessages,
      currentContext,
    }),
  );
  const localIntent = extractIntentLocally({
    latestCustomerMessage: latestCustomerMessage.content,
    recentMessages,
    currentContext,
  });
  structuredMs = elapsedMs(structuredStartedAt);
  const extractionMetadata = provider.getMetadata();

  const mergedIntent = mergeExtractedIntent(
    currentContext,
    supplementWithLocalSignals(extractedIntent, localIntent),
  );
  const processingKey = `${conversationId}:${latestCustomerMessage.timestamp.toISOString()}:${latestCustomerMessage.content}`;

  await createAuditEvent({
    conversationId,
    sessionId: conversation.sessionId,
    eventType: "INTENT_DETECTED",
    actor: "ai",
    summary: `${mergedIntent.intent} intent detected.`,
    metadata: {
      intent: mergedIntent.intent,
      category: mergedIntent.category,
      budget: mergedIntent.budget,
      useCases: mergedIntent.useCases,
      preferences: mergedIntent.preferences,
      provider: extractionMetadata.provider,
      model: extractionMetadata.model,
      fallbackProvider: extractionMetadata.fallbackProvider,
      fallbackFrom: extractionMetadata.fallbackFrom,
      fallbackOperation: extractionMetadata.fallbackOperation,
      structuredFallbackFrom: extractionMetadata.structuredFallbackFrom,
      structuredFallbackReason: extractionMetadata.structuredFallbackReason,
      fallbackReason: extractionMetadata.fallbackReason,
    },
    operationKey: `ai:intent:${processingKey}`,
  });
  await createAuditEvent({
    conversationId,
    sessionId: conversation.sessionId,
    eventType: "CUSTOMER_STATE_UPDATED",
    actor: "ai",
    summary: `Customer state updated to ${mergedIntent.customerState}.`,
    metadata: {
      priceSensitivity: mergedIntent.priceSensitivity,
      purchaseIntent: mergedIntent.purchaseIntent,
      abandonmentRisk: mergedIntent.abandonmentRisk,
      customerState: mergedIntent.customerState,
      provider: extractionMetadata.provider,
      model: extractionMetadata.model,
      fallbackProvider: extractionMetadata.fallbackProvider,
      fallbackFrom: extractionMetadata.fallbackFrom,
      fallbackOperation: extractionMetadata.fallbackOperation,
      structuredFallbackFrom: extractionMetadata.structuredFallbackFrom,
      structuredFallbackReason: extractionMetadata.structuredFallbackReason,
      fallbackReason: extractionMetadata.fallbackReason,
    },
    operationKey: `ai:state:${processingKey}`,
  });

  const catalogSearchInput = toCatalogSearchInput(mergedIntent);
  const catalogStartedAt = Date.now();
  const catalogResults =
    mergedIntent.intent === "product_search"
      ? await searchCatalog(catalogSearchInput)
      : [];
  catalogMs = elapsedMs(catalogStartedAt);
  const groundedResults = catalogResults.slice(0, MAX_RESULTS_FOR_RESPONSE);
  const recommendedProductIds = groundedResults
    .slice(0, MAX_RECOMMENDATIONS_TO_STORE)
    .map((result) => result.productId);
  const topRecommendation = groundedResults[0];

  const allowsDiscoveryAudit = existingCommerceState === "DISCOVERY" && mergedIntent.customerState !== "hesitating" && mergedIntent.customerState !== "ready_to_buy";
  if (mergedIntent.intent === "product_search" && allowsDiscoveryAudit) {
    await createAuditEvent({
      conversationId,
      sessionId: conversation.sessionId,
      eventType: "CATALOG_SEARCHED",
      actor: "catalog",
      summary: `Catalog searched and returned ${catalogResults.length} result(s).`,
      input: catalogSearchInput,
      metadata: {
        resultCount: catalogResults.length,
      },
      operationKey: `catalog:searched:${processingKey}`,
    });
  }

  if (topRecommendation && allowsDiscoveryAudit) {
    await createAuditEvent({
      conversationId,
      sessionId: conversation.sessionId,
      eventType: "PRODUCT_RECOMMENDED",
      actor: "catalog",
      summary: `${topRecommendation.name} ranked as the top recommendation.`,
      output: {
        topProductId: topRecommendation.productId,
        topProductName: topRecommendation.name,
        recommendationIds: recommendedProductIds,
      },
      metadata: {
        matchScore: topRecommendation.matchScore,
        matchReasons: topRecommendation.matchReasons,
      },
      operationKey: `catalog:recommended:${processingKey}`,
    });
  }

  const focusedProduct = getFocusedCatalogResult(groundedResults, latestCustomerMessage.content, previousFocusedProductId);
  const responseProducts = focusedProduct
    ? [focusedProduct, ...groundedResults.filter(product => product.productId !== focusedProduct.productId)]
    : groundedResults;
  const proposedAction = existingCommerceState === "DISCOVERY"
    ? proposePolicyAction(conversationId, mergedIntent, groundedResults, latestCustomerMessage.content, previousFocusedProductId)
    : { action: "NO_ACTION" as const, conversationId, reason: "Existing commerce state is authoritative for this turn." };
  await createAuditEvent({
    conversationId,
    sessionId: conversation.sessionId,
    eventType: "ACTION_PROPOSED",
    actor: "ai",
    summary: `${proposedAction.action} proposed.`,
    reason: proposedAction.reason,
    output: {
      action: proposedAction.action,
      productId: proposedAction.productId,
      orderValue: proposedAction.orderValue,
      requestedDiscountPercent: proposedAction.requestedDiscountPercent,
    },
    operationKey: `ai:proposal:${processingKey}`,
  });
  const policyDecision = await evaluateActionProposal(proposedAction);
  const assistantResponseMode = existingCommerceState === "PAYMENT_VERIFIED" ? "PAYMENT_VERIFIED"
    : existingCommerceState === "OFFER_ACCEPTED" ? "OFFER_ACCEPTED"
    : existingCommerceState === "CHECKOUT_READY" ? "CHECKOUT_READY"
    : existingCommerceState === "OFFER_AVAILABLE" ? "ACTIVE_OFFER"
    : proposedAction.action === "CREATE_DISCOUNT" ? "HESITATION_POLICY_RESULT"
    : proposedAction.action === "START_CHECKOUT" ? "CHECKOUT_READY"
    : mergedIntent.customerState === "comparing" ? "COMPARISON" : "DISCOVERY";
  const deterministicResponse = buildCommerceResponse({ state: existingCommerceState, offer: latestOffer, focusedProduct, policyDecision });
  const recommendationStartedAt = Date.now();
  const assistantContent = deterministicResponse ?? await provider.generateText({
    intent: mergedIntent, catalogResults: responseProducts, latestCustomerMessage: latestCustomerMessage.content,
    responseMode: assistantResponseMode, commerceState: existingCommerceState,
  });
  recommendationMs = elapsedMs(recommendationStartedAt);
  const assistantMetadata = provider.getMetadata();

  await updateExtractedContext(conversationId, {
    ...mergedIntent,
    lastUpdatedAt: new Date(),
  });
  await setRecommendedProducts(conversationId, recommendedProductIds);

  await appendMessage(conversationId, {
    role: "assistant",
    content: assistantContent,
    metadata: {
      provider: provider.name,
      model: provider.model,
      structuredProvider: extractionMetadata.provider,
      structuredModel: extractionMetadata.model,
      responseProvider: assistantMetadata.provider,
      responseModel: assistantMetadata.model,
      fallbackProvider: assistantMetadata.fallbackProvider,
      fallbackFrom: assistantMetadata.fallbackFrom,
      fallbackOperation: assistantMetadata.fallbackOperation,
      structuredFallbackFrom:
        extractionMetadata.structuredFallbackFrom ??
        assistantMetadata.structuredFallbackFrom,
      structuredFallbackReason:
        extractionMetadata.structuredFallbackReason ??
        assistantMetadata.structuredFallbackReason,
      responseFallbackFrom: assistantMetadata.responseFallbackFrom,
      responseFallbackReason: assistantMetadata.responseFallbackReason,
      fallbackReason: assistantMetadata.fallbackReason,
      recommendedProductIds,
      proposedAction,
      policyDecision,
    },
  });

  if (isDevelopment) {
    console.info("AI timing", {
      structuredMs,
      catalogMs,
      recommendationMs,
      totalMs: elapsedMs(totalStartedAt),
    });
  }

  return {
    conversationId,
    extractedContext: mergedIntent,
    recommendedProductIds,
    proposedAction,
    policyDecision,
    assistantMessage: {
      role: "assistant",
      content: assistantContent,
    },
    catalogResults: groundedResults,
  };
};
