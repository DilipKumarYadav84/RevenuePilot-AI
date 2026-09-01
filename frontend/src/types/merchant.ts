import type { AuditEvent } from "./audit";
import type { ExtractedConversationContext } from "./conversation";
import type { OfferStatus, PaymentStatus } from "./payment";

export type MerchantPolicy = {
  merchantKey: string;
  maxDiscountPercent: number;
  approvalThresholdPercent: number;
  minimumOrderAmount: number;
  maximumOffersPerConversation: number;
  offerExpiryMinutes: number;
  allowDiscounts: boolean;
  allowBundles: boolean;
  allowAlternativeProducts: boolean;
  allowCheckout: boolean;
  active: boolean;
};

export type MerchantPolicyUpdate = Partial<
  Pick<
    MerchantPolicy,
    | "maxDiscountPercent"
    | "approvalThresholdPercent"
    | "minimumOrderAmount"
    | "maximumOffersPerConversation"
    | "offerExpiryMinutes"
    | "allowDiscounts"
    | "allowBundles"
    | "allowAlternativeProducts"
    | "allowCheckout"
  >
>;

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
  lastActivity?: string;
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
  expiresAt: string;
  createdAt?: string;
};

export type DashboardPaymentSummary = {
  id: string;
  conversationId: string;
  offerId: string;
  amount: number;
  status: PaymentStatus;
  razorpayOrderId: string;
  verifiedAt?: string;
  createdAt?: string;
};

export type DashboardRecommendedProduct = {
  name: string;
  count: number;
};

export type DashboardCustomerState = {
  state: string;
  count: number;
};

export type DashboardSummary = {
  metrics: DashboardMetrics;
  funnel: DashboardFunnel;
  recentConversations: DashboardConversationSummary[];
  recentOffers: DashboardOfferSummary[];
  recentPayments: DashboardPaymentSummary[];
  topRecommendedProducts: DashboardRecommendedProduct[];
  customerStates: DashboardCustomerState[];
  recentAuditEvents: AuditEvent[];
};
