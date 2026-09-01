import type { AuditActor, AuditEventType } from "../audit/audit.types";
import type { ExtractedConversationContext } from "../conversations/conversation.types";
import type { OfferStatus } from "../offers/offer.types";
import type { PaymentStatus } from "../payments/payment.types";

export type DashboardMetrics = {
  activeConversations: number;
  totalConversations: number;
  recommendations: number;
  offersCreated: number;
  offersAccepted: number;
  verifiedPayments: number;
  verifiedRevenue: number;
  policyInterventions: number;
};

export type DashboardFunnel = {
  conversations: number;
  recommendations: number;
  offers: number;
  acceptedOffers: number;
  verifiedPayments: number;
};

export type DashboardConversationContext = Omit<
  ExtractedConversationContext,
  "abandonmentRisk"
>;

export type DashboardConversationSummary = {
  id: string;
  sessionRef: string;
  status: string;
  lastActivity?: Date | undefined;
  customerNeed: string | null;
  context: DashboardConversationContext;
};

export type DashboardOfferSummary = {
  id: string;
  conversationId: string;
  productId: string;
  requestedDiscountPercent: number;
  approvedDiscountPercent: number;
  policyDecision: string;
  status: OfferStatus;
  finalAmount: number;
  expiresAt: Date;
  createdAt?: Date | undefined;
};

export type DashboardPaymentSummary = {
  id: string;
  conversationId: string;
  offerId: string;
  amount: number;
  status: PaymentStatus;
  razorpayOrderId: string;
  verifiedAt?: Date | undefined;
  createdAt?: Date | undefined;
};

export type DashboardRecommendedProduct = {
  name: string;
  count: number;
};

export type DashboardCustomerState = {
  state: string;
  count: number;
};

export type DashboardAuditEvent = {
  conversationId: string;
  sessionId?: string | undefined;
  eventType: AuditEventType;
  actor: AuditActor;
  summary: string;
  reason?: string | undefined;
  input?: Record<string, unknown> | undefined;
  output?: Record<string, unknown> | undefined;
  metadata?: Record<string, unknown> | undefined;
  createdAt?: Date | undefined;
};

export type DashboardSummary = {
  metrics: DashboardMetrics;
  funnel: DashboardFunnel;
  recentConversations: DashboardConversationSummary[];
  recentOffers: DashboardOfferSummary[];
  recentPayments: DashboardPaymentSummary[];
  topRecommendedProducts: DashboardRecommendedProduct[];
  customerStates: DashboardCustomerState[];
  recentAuditEvents: DashboardAuditEvent[];
};
