import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDashboardFunnel,
  calculateConversionRate,
  getActiveConversationWindowStart,
  mapConversationSummary,
  mapDashboardAuditEvent,
  mapPaymentSummary,
} from "../../src/modules/dashboard/dashboard.service";
import type { AuditEvent } from "../../src/modules/audit/audit.types";
import type { Conversation } from "../../src/modules/conversations/conversation.types";
import type { PaymentRecord } from "../../src/modules/payments/payment.types";

test("dashboard funnel counts unique qualifying conversations, not repeated events", () => {
  assert.deepEqual(buildDashboardFunnel({
    conversations: ["a", "b", "c", "d"], recommendations: ["a", "a", "b", "c", "deleted"],
    offers: ["a", "b", "b"], acceptedOffers: ["a", "a"], verifiedPayments: ["a", "a"],
  }), {
    conversations: 4,
    recommendations: 3,
    offers: 2,
    acceptedOffers: 1,
    verifiedPayments: 1,
  });
});

test("empty funnel excludes orphan events and payments", () => {
  assert.deepEqual(buildDashboardFunnel({ conversations: [], recommendations: ["deleted"],
    offers: ["deleted"], acceptedOffers: [], verifiedPayments: ["deleted"] }),
  { conversations: 0, recommendations: 0, offers: 0, acceptedOffers: 0, verifiedPayments: 0 });
});

test("independent milestones preserve legacy gaps rather than inventing acceptance", () => {
  const funnel = buildDashboardFunnel({ conversations: ["a", "b"], recommendations: ["a"],
    offers: ["a"], acceptedOffers: [], verifiedPayments: ["a", "b"] });
  assert.equal(funnel.acceptedOffers, 0);
  assert.equal(funnel.verifiedPayments, 2);
  assert.equal(calculateConversionRate(funnel.verifiedPayments, funnel.conversations), 100);
});

test("direct checkout records count toward offer and acceptance milestones", () => {
  const funnel = buildDashboardFunnel({ conversations: ["direct", "discount"],
    recommendations: ["direct", "discount"], offers: ["direct", "discount"],
    acceptedOffers: ["direct"], verifiedPayments: ["direct"] });
  assert.equal(funnel.offers, 2);
  assert.equal(funnel.acceptedOffers, 1);
});

test("conversion rate handles empty funnels", () => {
  assert.equal(calculateConversionRate(1, 4), 25);
  assert.equal(calculateConversionRate(1, 0), 0);
});

test("active conversation window is recent and deterministic", () => {
  assert.equal(
    getActiveConversationWindowStart(new Date("2026-09-01T12:00:00.000Z")).toISOString(),
    "2026-08-31T12:00:00.000Z",
  );
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
