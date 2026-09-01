export type AuditActor =
  | "customer"
  | "assistant"
  | "ai"
  | "catalog"
  | "policy_engine"
  | "system"
  | "merchant"
  | "payment";

export type AuditEventType =
  | "CONVERSATION_STARTED"
  | "CUSTOMER_MESSAGE_RECEIVED"
  | "ASSISTANT_MESSAGE_CREATED"
  | "INTENT_DETECTED"
  | "CUSTOMER_STATE_UPDATED"
  | "CATALOG_SEARCHED"
  | "PRODUCT_RECOMMENDED"
  | "ACTION_PROPOSED"
  | "POLICY_APPROVED"
  | "POLICY_MODIFIED"
  | "POLICY_BLOCKED"
  | "POLICY_REQUIRES_APPROVAL"
  | "OFFER_CREATED"
  | "OFFER_ACCEPTED"
  | "OFFER_REJECTED"
  | "OFFER_EXPIRED"
  | "RAZORPAY_ORDER_CREATED"
  | "PAYMENT_VERIFICATION_SUCCEEDED"
  | "PAYMENT_VERIFICATION_FAILED";

export type AuditEvent = {
  conversationId: string;
  sessionId?: string;
  eventType: AuditEventType;
  actor: AuditActor;
  summary: string;
  reason?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};
