import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDashboardFunnel,
  calculateConversionRate,
  mapConversationSummary,
  mapDashboardAuditEvent,
  mapPaymentSummary,
} from "../../src/modules/dashboard/dashboard.service";
import type { AuditEvent } from "../../src/modules/audit/audit.types";
import type { Conversation } from "../../src/modules/conversations/conversation.types";
import type { DashboardMetrics } from "../../src/modules/dashboard/dashboard.types";
import type { PaymentRecord } from "../../src/modules/payments/payment.types";

const metrics: DashboardMetrics = {
  activeConversations: 2,
  totalConversations: 4,
  recommendations: 3,
  offersCreated: 2,
  offersAccepted: 1,
  verifiedPayments: 1,
  verifiedRevenue: 6299910,
  policyInterventions: 1,
};

test("dashboard funnel uses real aggregate counts", () => {
  assert.deepEqual(buildDashboardFunnel(metrics), {
    conversations: 4,
    recommendations: 3,
    offers: 2,
    acceptedOffers: 1,
    verifiedPayments: 1,
  });
});

test("conversion rate handles empty funnels", () => {
  assert.equal(calculateConversionRate(1, 4), 25);
  assert.equal(calculateConversionRate(1, 0), 0);
});

test("payment summary exposes safe payment fields only", () => {
  const summary = mapPaymentSummary({
    _id: "507f1f77bcf86cd799439111",
    conversationId: "507f1f77bcf86cd799439011",
    offerId: "507f1f77bcf86cd799439012",
    productId: "507f1f77bcf86cd799439013",
    amount: 6299910,
    currency: "INR",
    razorpayOrderId: "order_test_123",
    razorpayPaymentId: "pay_test_123",
    status: "verified",
    receipt: "rp_99439111_abcdef123456",
    operationKey: "payment:secret-internal-key",
    verifiedAt: new Date("2026-08-28T10:00:00.000Z"),
  } as PaymentRecord);

  assert.deepEqual(Object.keys(summary).sort(), [
    "amount",
    "conversationId",
    "createdAt",
    "id",
    "offerId",
    "razorpayOrderId",
    "status",
    "verifiedAt",
  ].sort());
  assert.equal(JSON.stringify(summary).includes("operationKey"), false);
  assert.equal(JSON.stringify(summary).includes("signature"), false);
});

test("dashboard conversation summary omits abandonment risk", () => {
  const summary = mapConversationSummary({
    _id: "507f1f77bcf86cd799439111",
    sessionId: "session-visible-reference",
    status: "active",
    messages: [
      {
        role: "customer",
        content: "I like it, but the price is high.",
        timestamp: new Date("2026-08-28T10:00:00.000Z"),
      },
    ],
    extractedContext: {
      intent: "product_search",
      category: "laptop",
      budget: 70000,
      priceSensitivity: "high",
      abandonmentRisk: "high",
      customerState: "hesitating",
    },
    recommendedProductIds: [],
  } as unknown as Conversation);

  assert.equal("abandonmentRisk" in summary.context, false);
  assert.equal(summary.context.customerState, "hesitating");
});

test("dashboard audit event strips operation keys and sensitive nested fields", () => {
  const summary = mapDashboardAuditEvent({
    conversationId: "507f1f77bcf86cd799439011",
    eventType: "PAYMENT_VERIFICATION_FAILED",
    actor: "payment",
    summary: "Verification failed.",
    input: {
      razorpay_signature: "signature-value",
      safePaymentId: "pay_visible",
    },
    output: {
      paymentRecordId: "507f1f77bcf86cd799439111",
      signature: "raw-signature",
    },
    metadata: {
      abandonmentRisk: "high",
      status: "failed",
    },
    operationKey: "audit:payment:secret-operation",
    createdAt: new Date("2026-08-28T10:00:00.000Z"),
  } as AuditEvent);

  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes("operationKey"), false);
  assert.equal(serialized.includes("secret-operation"), false);
  assert.equal(serialized.includes("signature-value"), false);
  assert.equal(serialized.includes("raw-signature"), false);
  assert.equal(serialized.includes("abandonmentRisk"), false);
  assert.equal(summary.input?.safePaymentId, "pay_visible");
});
