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

export type AuditActor =
  | "customer"
  | "assistant"
  | "ai"
  | "catalog"
  | "policy_engine"
  | "system"
  | "merchant"
  | "payment";

export type AuditSafeObject = Record<string, unknown>;

export type AuditEvent = {
  conversationId: string;
  sessionId?: string | undefined;
  eventType: AuditEventType;
  actor: AuditActor;
  summary: string;
  reason?: string | undefined;
  input?: AuditSafeObject | undefined;
  output?: AuditSafeObject | undefined;
  metadata?: AuditSafeObject | undefined;
  operationKey?: string | undefined;
  createdAt?: Date;
};

export type CreateAuditEventInput = Omit<AuditEvent, "createdAt">;

export type AuditEventFilter = {
  conversationId?: string | undefined;
  eventType?: AuditEventType | undefined;
  actor?: AuditActor | undefined;
  limit?: number | undefined;
  page?: number | undefined;
};
