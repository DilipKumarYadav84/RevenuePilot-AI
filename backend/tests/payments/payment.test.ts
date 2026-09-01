import assert from "node:assert/strict";
import test from "node:test";

import type { Offer } from "../../src/modules/offers/offer.types";
import {
  assertOfferPayable,
  buildPaymentOperationKey,
  buildPaymentReceipt,
  buildPaymentRecordFromOffer,
  createPaymentVerificationFailedAuditInput,
  createPaymentVerificationSucceededAuditInput,
  createRazorpayOrderCreatedAuditInput,
  isOfferExpiredForPayment,
  toCreateOrderResult,
  toSafePaymentRecord,
} from "../../src/modules/payments/payment.service";
import type { PaymentRecord } from "../../src/modules/payments/payment.types";
import {
  buildRazorpayVerificationPayload,
  createRazorpayOrder,
  extractSafeRazorpayErrorDetails,
  formatRazorpayErrorDiagnostics,
  RazorpayServiceError,
  signRazorpayPayload,
  verifyRazorpaySignature,
} from "../../src/modules/payments/razorpay.service";
import {
  createPaymentOrderSchema,
  verifyPaymentSchema,
} from "../../src/modules/payments/payment.validation";

const offerId = "507f1f77bcf86cd799439111";
const paymentId = "507f1f77bcf86cd799439222";

const sampleOffer = (overrides: Partial<Offer> = {}): Offer => ({
  _id: offerId,
  conversationId: "507f1f77bcf86cd799439011",
  productId: "507f1f77bcf86cd799439012",
  actionType: "CREATE_DISCOUNT",
  requestedDiscountPercent: 10,
  approvedDiscountPercent: 10,
  originalAmount: 6999900,
  discountAmount: 699990,
  finalAmount: 6299910,
  currency: "INR",
  amountUnit: "paise",
  policyDecision: "APPROVED",
  status: "accepted",
  reason: "Customer accepted policy-approved offer.",
  expiresAt: new Date("2026-08-28T10:10:00.000Z"),
  executionKey: "offer:test-key",
  ...overrides,
} as Offer);

const samplePayment = (
  overrides: Partial<PaymentRecord> = {},
): PaymentRecord => ({
  _id: paymentId,
  conversationId: "507f1f77bcf86cd799439011",
  offerId,
  productId: "507f1f77bcf86cd799439012",
  amount: 6299910,
  currency: "INR",
  razorpayOrderId: "order_test_123",
  razorpayPaymentId: "pay_test_123",
  status: "created",
  receipt: "rp_99439111_abcdef123456",
  operationKey: "payment:test-idempotency-key",
  createdAt: new Date("2026-08-28T10:00:00.000Z"),
  updatedAt: new Date("2026-08-28T10:00:00.000Z"),
  ...overrides,
});

test("accepted offer is payable before expiry", () => {
  assert.doesNotThrow(() =>
    assertOfferPayable(sampleOffer(), new Date("2026-08-28T10:00:00.000Z")),
  );
});

test("created offer cannot create a payment order", () => {
  assert.throws(
    () =>
      assertOfferPayable(
        sampleOffer({ status: "created" }),
        new Date("2026-08-28T10:00:00.000Z"),
      ),
    /must be accepted/,
  );
});

test("rejected offer cannot create a payment order", () => {
  assert.throws(
    () =>
      assertOfferPayable(
        sampleOffer({ status: "rejected" }),
        new Date("2026-08-28T10:00:00.000Z"),
      ),
    /must be accepted/,
  );
});

test("expired accepted offer cannot create a payment order", () => {
  const expiredOffer = sampleOffer({
    expiresAt: new Date("2026-08-28T09:59:59.000Z"),
  });

  assert.equal(
    isOfferExpiredForPayment(expiredOffer, new Date("2026-08-28T10:00:00.000Z")),
    true,
  );
  assert.throws(
    () => assertOfferPayable(expiredOffer, new Date("2026-08-28T10:00:00.000Z")),
    /expired/,
  );
});

test("zero or negative offer amount cannot create a payment order", () => {
  assert.throws(
    () =>
      assertOfferPayable(
        sampleOffer({ finalAmount: 0 }),
        new Date("2026-08-28T10:00:00.000Z"),
      ),
    /greater than zero/,
  );
});

test("create order validation rejects client amount override", () => {
  const parsed = createPaymentOrderSchema.safeParse({
    offerId,
    amount: 1,
    idempotencyKey: "checkout-attempt-1",
  });

  assert.equal(parsed.success, false);
});

test("create order validation accepts offer id and idempotency key only", () => {
  const parsed = createPaymentOrderSchema.safeParse({
    offerId,
    idempotencyKey: "checkout-attempt-1",
  });

  assert.equal(parsed.success, true);
});

test("payment operation key is stable for default offer id", () => {
  assert.equal(buildPaymentOperationKey(offerId), buildPaymentOperationKey(offerId));
});

test("payment operation key uses explicit idempotency key", () => {
  assert.equal(
    buildPaymentOperationKey(offerId, "checkout-attempt-1"),
    "payment:checkout-attempt-1",
  );
});

test("receipt is safe and within Razorpay limit", () => {
  const receipt = buildPaymentReceipt(
    "payment:checkout-attempt-1",
    "507f1f77bcf86cd799439111",
  );

  assert.match(receipt, /^rp_[A-Za-z0-9]{8}_[a-f0-9]{12}$/);
  assert.equal(receipt.length <= 40, true);
  assert.equal(receipt.length, 24);
});

test("receipt handles long idempotency keys without exceeding Razorpay limit", () => {
  const receipt = buildPaymentReceipt(
    `payment:${"checkout-attempt-".repeat(20)}`,
    "507f1f77bcf86cd799439111",
  );

  assert.equal(receipt.length <= 40, true);
  assert.equal(receipt.length, 24);
});

test("payment record uses persisted finalAmount in paise without double conversion", () => {
  const record = buildPaymentRecordFromOffer({
    offer: sampleOffer(),
    operationKey: "payment:checkout-attempt-1",
    receipt: "rp_99439111_abcdef123456",
    razorpayOrderId: "order_test_123",
  });

  assert.equal(record.amount, 6299910);
});

test("receipt remains stable and traceable for the current payment record flow", () => {
  const operationKey = buildPaymentOperationKey(offerId, "checkout-attempt-1");
  const receipt = buildPaymentReceipt(operationKey, offerId);
  const record = buildPaymentRecordFromOffer({
    offer: sampleOffer(),
    operationKey,
    receipt,
    razorpayOrderId: "order_test_123",
  });

  assert.equal(receipt, buildPaymentReceipt(operationKey, offerId));
  assert.equal(receipt.includes(offerId.slice(-8)), true);
  assert.equal(record.receipt, receipt);
});

test("create order response exposes key id but never key secret", () => {
  const result = toCreateOrderResult(samplePayment(), "rzp_test_publickey");

  assert.equal(result.keyId, "rzp_test_publickey");
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("safe payment response never includes operation key or signature", () => {
  const safePayment = toSafePaymentRecord(samplePayment());
  const serialized = JSON.stringify(safePayment);

  assert.equal("operationKey" in safePayment, false);
  assert.equal(serialized.includes("signature"), false);
});

test("verification payload uses order id and payment id", () => {
  assert.equal(
    buildRazorpayVerificationPayload("order_test_123", "pay_test_123"),
    "order_test_123|pay_test_123",
  );
});

test("valid Razorpay signature verifies", () => {
  const signature = signRazorpayPayload(
    buildRazorpayVerificationPayload("order_test_123", "pay_test_123"),
    "test_secret",
  );

  assert.equal(
    verifyRazorpaySignature({
      razorpayOrderId: "order_test_123",
      razorpayPaymentId: "pay_test_123",
      razorpaySignature: signature,
      keySecret: "test_secret",
    }),
    true,
  );
});

test("invalid Razorpay signature fails verification", () => {
  assert.equal(
    verifyRazorpaySignature({
      razorpayOrderId: "order_test_123",
      razorpayPaymentId: "pay_test_123",
      razorpaySignature: "0".repeat(64),
      keySecret: "test_secret",
    }),
    false,
  );
});

test("verification uses server-stored order id, so another order id fails", () => {
  const browserSignature = signRazorpayPayload(
    buildRazorpayVerificationPayload("order_attacker", "pay_test_123"),
    "test_secret",
  );

  assert.equal(
    verifyRazorpaySignature({
      razorpayOrderId: "order_test_123",
      razorpayPaymentId: "pay_test_123",
      razorpaySignature: browserSignature,
      keySecret: "test_secret",
    }),
    false,
  );
});

test("verification validation rejects malformed payload", () => {
  const parsed = verifyPaymentSchema.safeParse({
    paymentRecordId: paymentId,
    razorpay_payment_id: "pay_test_123",
    razorpay_order_id: "order_test_123",
  });

  assert.equal(parsed.success, false);
});

test("order created audit event is emitted with safe payment fields", () => {
  const auditInput = createRazorpayOrderCreatedAuditInput(samplePayment());

  assert.equal(auditInput.eventType, "RAZORPAY_ORDER_CREATED");
  assert.equal(auditInput.actor, "payment");
  assert.equal(auditInput.output?.amount, 6299910);
  assert.equal(JSON.stringify(auditInput).includes("secret"), false);
});

test("verification success audit event is emitted with payment id", () => {
  const auditInput = createPaymentVerificationSucceededAuditInput(
    samplePayment({ status: "verified" }),
  );

  assert.equal(auditInput.eventType, "PAYMENT_VERIFICATION_SUCCEEDED");
  assert.equal(auditInput.output?.razorpayPaymentId, "pay_test_123");
});

test("verification failure audit event is emitted without signature", () => {
  const auditInput = createPaymentVerificationFailedAuditInput(
    samplePayment({ status: "verification_failed" }),
    "Invalid Razorpay payment signature.",
  );

  assert.equal(auditInput.eventType, "PAYMENT_VERIFICATION_FAILED");
  assert.equal(JSON.stringify(auditInput).includes("0".repeat(64)), false);
});

test("Razorpay SDK error details are extracted from normalized error shape", () => {
  const details = extractSafeRazorpayErrorDetails({
    statusCode: 400,
    error: {
      code: "BAD_REQUEST_ERROR",
      description: "receipt: the length must be no more than 40",
      reason: "NA",
      source: "business",
      step: "payment_initiation",
    },
  });

  assert.deepEqual(details, {
    statusCode: 400,
    code: "BAD_REQUEST_ERROR",
    description: "receipt: the length must be no more than 40",
    reason: "NA",
    source: "business",
    step: "payment_initiation",
  });
});

test("Razorpay diagnostics redact credentials, authorization, and signatures", () => {
  const details = extractSafeRazorpayErrorDetails({
    statusCode: 400,
    error: {
      code: "BAD_REQUEST_ERROR",
      description:
        "The api key rzp_test_1234567890 is invalid. authorization Basic abc123. razorpay_signature 0".padEnd(
          160,
          "0",
        ),
      reason: "NA",
    },
  });
  const diagnostics = formatRazorpayErrorDiagnostics(details);

  assert.equal(diagnostics.includes("rzp_test_1234567890"), false);
  assert.equal(diagnostics.includes("authorization Basic abc123"), false);
  assert.equal(diagnostics.includes("razorpay_signature"), true);
  assert.equal(diagnostics.includes("0".repeat(64)), false);
  assert.match(diagnostics, /rzp_test_\[redacted\]/);
  assert.match(diagnostics, /authorization=\[redacted\]/);
  assert.match(diagnostics, /razorpay_signature=\[redacted\]/);
});

test("Razorpay order creation logs safe development details and throws service error", async () => {
  const originalError = console.error;
  const logs: string[] = [];
  console.error = (message?: unknown): void => {
    logs.push(String(message));
  };

  try {
    await assert.rejects(
      createRazorpayOrder(
        {
          amount: 6299910,
          currency: "INR",
          receipt: "rp_99439111_abcdef123456",
        },
        {
          orders: {
            create: async () => {
              throw {
                statusCode: 400,
                error: {
                  code: "BAD_REQUEST_ERROR",
                  description: "The api key provided is invalid",
                  reason: "NA",
                },
              };
            },
          },
        },
      ),
      (error: unknown) =>
        error instanceof RazorpayServiceError &&
        error.statusCode === 502 &&
        error.message ===
          "Razorpay order creation failed. BAD_REQUEST_ERROR: The api key provided is invalid",
    );
  } finally {
    console.error = originalError;
  }

  assert.match(logs.join("\n"), /statusCode: 400/);
  assert.match(logs.join("\n"), /code: BAD_REQUEST_ERROR/);
  assert.match(logs.join("\n"), /description: The api key provided is invalid/);
  assert.match(logs.join("\n"), /reason: NA/);
});
