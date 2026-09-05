import { AuditEventModel } from "../audit/audit.model";
import { sortAuditEventsChronologically, summarizeContent } from "../audit/audit.service";
import type { AuditEvent, AuditEventType } from "../audit/audit.types";
import { ConversationModel } from "../conversations/conversation.model";
import type { Conversation } from "../conversations/conversation.types";
import { OfferModel } from "../offers/offer.model";
import type { Offer } from "../offers/offer.types";
import { PaymentModel } from "../payments/payment.model";
import type { PaymentRecord } from "../payments/payment.types";
import type {
  DashboardAuditEvent,
  DashboardConversationContext,
  DashboardConversationSummary,
  DashboardCustomerState,
  DashboardFunnel,
  DashboardMetrics,
  DashboardOfferSummary,
  DashboardPaymentSummary,
  DashboardRecommendedProduct,
  DashboardSummary,
} from "./dashboard.types";

const POLICY_INTERVENTION_EVENTS: AuditEventType[] = [
  "POLICY_MODIFIED",
  "POLICY_BLOCKED",
  "POLICY_REQUIRES_APPROVAL",
];
const ACTIVE_CONVERSATION_WINDOW_MS = 24 * 60 * 60 * 1000;

const getObjectIdString = (record: unknown): string => {
  if (!record || typeof record !== "object" || !("_id" in record)) {
    return "";
  }

  const id = (record as { _id?: unknown })._id;
  return id ? String(id) : "";
};

const getLastCustomerNeed = (conversation: Conversation): string | null => {
  const customerMessage = [...conversation.messages]
    .reverse()
    .find((message) => message.role === "customer");

  return customerMessage ? summarizeContent(customerMessage.content) : null;
};

const sensitiveDashboardKeys = new Set([
  "__v",
  "_id",
  "authorization",
  "abandonmentRisk",
  "operationKey",
  "razorpaySignature",
  "razorpay_signature",
  "signature",
]);

const sanitizeDashboardValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitizeDashboardValue);
  }

  if (value instanceof Date) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
    (safeObject, [key, nestedValue]) => {
      if (!sensitiveDashboardKeys.has(key)) {
        safeObject[key] = sanitizeDashboardValue(nestedValue);
      }

      return safeObject;
    },
    {},
  );
};

const sanitizeDashboardObject = (
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined => {
  if (!value) {
    return undefined;
  }

  const sanitized = sanitizeDashboardValue(value);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : undefined;
};

export const sanitizeConversationContext = (
  context: Conversation["extractedContext"],
): DashboardConversationContext => {
  const { abandonmentRisk: _abandonmentRisk, ...safeContext } = context;
  return safeContext;
};

export const calculateConversionRate = (
  numerator: number,
  denominator: number,
): number => {
  if (denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
};

export const getActiveConversationWindowStart = (now = new Date()): Date =>
  new Date(now.getTime() - ACTIVE_CONVERSATION_WINDOW_MS);

export const buildDashboardFunnel = (
  stages: { conversations: unknown[]; recommendations: unknown[]; offers: unknown[];
    acceptedOffers: unknown[]; verifiedPayments: unknown[] },
): DashboardFunnel => {
  const qualifying = new Set(stages.conversations.map(String));
  const count = (ids: unknown[]) => new Set(ids.map(String).filter(id => qualifying.has(id))).size;
  return {
    conversations: qualifying.size,
    recommendations: count(stages.recommendations),
    offers: count(stages.offers),
    acceptedOffers: count(stages.acceptedOffers),
    verifiedPayments: count(stages.verifiedPayments),
  };
};

export const mapConversationSummary = (
  conversation: Conversation,
): DashboardConversationSummary => ({
  id: getObjectIdString(conversation),
  sessionRef: conversation.sessionId.slice(-10),
  status: conversation.status,
  lastActivity: conversation.updatedAt,
  customerNeed: getLastCustomerNeed(conversation),
  context: sanitizeConversationContext(conversation.extractedContext),
});

export const mapOfferSummary = (offer: Offer): DashboardOfferSummary => ({
  id: getObjectIdString(offer),
  conversationId: offer.conversationId,
  productId: offer.productId,
  requestedDiscountPercent: offer.requestedDiscountPercent,
  approvedDiscountPercent: offer.approvedDiscountPercent,
  policyDecision: offer.policyDecision,
  status: offer.status,
  finalAmount: offer.finalAmount,
  expiresAt: offer.expiresAt,
  createdAt: offer.createdAt,
});

export const mapPaymentSummary = (
  payment: PaymentRecord,
): DashboardPaymentSummary => ({
  id: getObjectIdString(payment),
  conversationId: payment.conversationId,
  offerId: payment.offerId,
  amount: payment.amount,
  status: payment.status,
  razorpayOrderId: payment.razorpayOrderId,
  verifiedAt: payment.verifiedAt,
  createdAt: payment.createdAt,
});

export const mapDashboardAuditEvent = (event: AuditEvent): DashboardAuditEvent => ({
  conversationId: event.conversationId,
  sessionId: event.sessionId,
  eventType: event.eventType,
  actor: event.actor,
  summary: event.summary,
  reason: event.reason,
  input: sanitizeDashboardObject(event.input),
  output: sanitizeDashboardObject(event.output),
  metadata: sanitizeDashboardObject(event.metadata),
  createdAt: event.createdAt,
});

const getTopRecommendedProducts = (
  events: AuditEvent[],
): DashboardRecommendedProduct[] => {
  const counts = new Map<string, number>();

  for (const event of events) {
    const productName = event.output?.topProductName;

    if (typeof productName === "string") {
      counts.set(productName, (counts.get(productName) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name))
    .slice(0, 5);
};

const getCustomerStates = (
  conversations: Conversation[],
): DashboardCustomerState[] => {
  const counts = new Map<string, number>();

  for (const conversation of conversations) {
    const state = conversation.extractedContext.customerState ?? "unknown";
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([state, count]) => ({ state, count }))
    .sort((first, second) => second.count - first.count || first.state.localeCompare(second.state));
};

export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  const [
    totalConversations,
    activeConversations,
    recommendations,
    offersCreated,
    offersAccepted,
    verifiedPayments,
    policyInterventions,
    revenueAggregation,
    recentConversations,
    recentOffers,
    recentPayments,
    recommendationEvents,
    recentAuditEvents,
    conversationIds,
    recommendedConversationIds,
    offerConversationIds,
    acceptedConversationIds,
    verifiedConversationIds,
  ] = await Promise.all([
    ConversationModel.countDocuments({}).exec(),
    ConversationModel.countDocuments({
      status: "active",
      updatedAt: { $gte: getActiveConversationWindowStart() },
    }).exec(),
    AuditEventModel.countDocuments({ eventType: "PRODUCT_RECOMMENDED" }).exec(),
    OfferModel.countDocuments({ actionType: "CREATE_DISCOUNT" }).exec(),
    OfferModel.countDocuments({ actionType: "CREATE_DISCOUNT", status: "accepted" }).exec(),
    PaymentModel.countDocuments({ status: "verified" }).exec(),
    AuditEventModel.countDocuments({
      eventType: { $in: POLICY_INTERVENTION_EVENTS },
    }).exec(),
    PaymentModel.aggregate<{ total: number }>([
      { $match: { status: "verified" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]).exec(),
    ConversationModel.find({})
      .sort({ updatedAt: -1, _id: -1 })
      .limit(12)
      .lean<Conversation[]>()
      .exec(),
    OfferModel.find({ actionType: "CREATE_DISCOUNT" })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .lean<Offer[]>()
      .exec(),
    PaymentModel.find({})
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .lean<PaymentRecord[]>()
      .exec(),
    AuditEventModel.find({ eventType: "PRODUCT_RECOMMENDED" })
      .sort({ createdAt: -1, _id: -1 })
      .limit(200)
      .lean<AuditEvent[]>()
      .exec(),
    AuditEventModel.find({})
      .sort({ createdAt: -1, _id: -1 })
      .limit(40)
      .lean<AuditEvent[]>()
      .exec(),
    ConversationModel.distinct("_id").exec(),
    AuditEventModel.distinct("conversationId", { eventType: "PRODUCT_RECOMMENDED" }).exec(),
    // Include direct-checkout offers in the journey stages, but keep the incentive KPI separate.
    OfferModel.distinct("conversationId").exec(),
    OfferModel.distinct("conversationId", { status: "accepted" }).exec(),
    PaymentModel.distinct("conversationId", { status: "verified" }).exec(),
  ]);

  const metrics: DashboardMetrics = {
    activeConversations,
    totalConversations,
    recommendations,
    offersCreated,
    offersAccepted,
    verifiedPayments,
    verifiedRevenue: revenueAggregation[0]?.total ?? 0,
    policyInterventions,
  };

  return {
    metrics,
    funnel: buildDashboardFunnel({
      conversations: conversationIds, recommendations: recommendedConversationIds,
      offers: offerConversationIds, acceptedOffers: acceptedConversationIds,
      verifiedPayments: verifiedConversationIds,
    }),
    recentConversations: recentConversations.map(mapConversationSummary),
    recentOffers: recentOffers.map(mapOfferSummary),
    recentPayments: recentPayments.map(mapPaymentSummary),
    topRecommendedProducts: getTopRecommendedProducts(recommendationEvents),
    customerStates: getCustomerStates(recentConversations),
    recentAuditEvents: sortAuditEventsChronologically(recentAuditEvents).map(
      mapDashboardAuditEvent,
    ),
  };
};

export const getDashboardConversationAudit = async (
  conversationId: string,
): Promise<DashboardAuditEvent[]> => {
  const events = await AuditEventModel.find({ conversationId })
    .sort({ createdAt: 1, _id: 1 })
    .lean<AuditEvent[]>()
    .exec();

  return sortAuditEventsChronologically(events).map(mapDashboardAuditEvent);
};
