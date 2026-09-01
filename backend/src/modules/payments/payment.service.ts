import { createHash } from "node:crypto";

import { createAuditEvent } from "../audit/audit.service";
import { getOfferById } from "../offers/offer.service";
import type { Offer } from "../offers/offer.types";
import { PaymentModel } from "./payment.model";
import type {
  CreatePaymentOrderInput,
  CreatePaymentOrderResult,
  PaymentRecord,
  SafePaymentRecord,
  VerifyPaymentInput,
} from "./payment.types";
import {
  createRazorpayOrder,
  getRazorpayKeyId,
  verifyRazorpayPaymentSignature,
} from "./razorpay.service";

const PAYABLE_PAYMENT_STATUSES: PaymentRecord["status"][] = [
  "created",
  "verification_pending",
  "verified",
];

export class PaymentServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

const getObjectIdString = (record: { _id?: unknown }): string => {
  if (!record._id) {
    return "";
  }

  return String(record._id);
};

export const buildPaymentOperationKey = (
  offerId: string,
  idempotencyKey?: string,
): string => {
  if (idempotencyKey) {
    return `payment:${idempotencyKey}`;
  }

  return `payment:${createHash("sha256").update(offerId).digest("hex")}`;
};

const toReceiptTracePart = (traceId: string | undefined, fallbackDigest: string): string => {
  const sanitizedTraceId = traceId?.replace(/[^A-Za-z0-9]/g, "") ?? "";

  return (sanitizedTraceId || fallbackDigest).slice(-8);
};

export const buildPaymentReceipt = (
  operationKey: string,
  traceId?: string,
): string => {
  const digest = createHash("sha256").update(operationKey).digest("hex");
  return `rp_${toReceiptTracePart(traceId, digest)}_${digest.slice(0, 12)}`;
};

export const isOfferExpiredForPayment = (
  offer: Pick<Offer, "expiresAt">,
  now = new Date(),
): boolean => offer.expiresAt.getTime() <= now.getTime();

export const assertOfferPayable = (offer: Offer, now = new Date()): void => {
  if (offer.status !== "accepted") {
    throw new PaymentServiceError(
      `Offer must be accepted before payment. Current status: ${offer.status}.`,
      409,
    );
  }

  if (isOfferExpiredForPayment(offer, now)) {
    throw new PaymentServiceError("Accepted offer has expired.", 409);
  }

  if (!Number.isInteger(offer.finalAmount) || offer.finalAmount <= 0) {
    throw new PaymentServiceError("Offer final amount must be greater than zero.", 409);
  }
};

export const toSafePaymentRecord = (
  payment: PaymentRecord,
): SafePaymentRecord => {
  const safePayment: SafePaymentRecord = {
    id: getObjectIdString(payment),
    conversationId: payment.conversationId,
    offerId: payment.offerId,
    productId: payment.productId,
    amount: payment.amount,
    currency: payment.currency,
    razorpayOrderId: payment.razorpayOrderId,
    status: payment.status,
    receipt: payment.receipt,
  };

  if (payment.razorpayPaymentId) {
    safePayment.razorpayPaymentId = payment.razorpayPaymentId;
  }

  if (payment.verifiedAt) {
    safePayment.verifiedAt = payment.verifiedAt;
  }

  if (payment.createdAt) {
    safePayment.createdAt = payment.createdAt;
  }

  if (payment.updatedAt) {
    safePayment.updatedAt = payment.updatedAt;
  }

  return safePayment;
};

export const toCreateOrderResult = (
  payment: PaymentRecord,
  keyId: string,
): CreatePaymentOrderResult => ({
  paymentRecordId: getObjectIdString(payment),
  razorpayOrderId: payment.razorpayOrderId,
  amount: payment.amount,
  currency: payment.currency,
  keyId,
  receipt: payment.receipt,
  status: payment.status,
});

export const buildPaymentRecordFromOffer = (input: {
  offer: Offer;
  operationKey: string;
  receipt: string;
  razorpayOrderId: string;
}): Omit<PaymentRecord, "status"> & { status: "created" } => ({
  conversationId: input.offer.conversationId,
  offerId:
    getObjectIdString(input.offer as Offer & { _id?: unknown }) ||
    input.operationKey,
  productId: input.offer.productId,
  amount: input.offer.finalAmount,
  currency: input.offer.currency,
  razorpayOrderId: input.razorpayOrderId,
  status: "created",
  receipt: input.receipt,
  operationKey: input.operationKey,
});

export const createRazorpayOrderCreatedAuditInput = (
  payment: PaymentRecord,
): Parameters<typeof createAuditEvent>[0] => ({
  conversationId: payment.conversationId,
  eventType: "RAZORPAY_ORDER_CREATED",
  actor: "payment",
  summary: "Razorpay test-mode order created for accepted offer.",
  output: {
    paymentRecordId: getObjectIdString(payment),
    offerId: payment.offerId,
    productId: payment.productId,
    razorpayOrderId: payment.razorpayOrderId,
    amount: payment.amount,
    currency: payment.currency,
    receipt: payment.receipt,
  },
  operationKey: `audit:${payment.operationKey}:order-created`,
});

export const createPaymentVerificationSucceededAuditInput = (
  payment: PaymentRecord,
): Parameters<typeof createAuditEvent>[0] => ({
  conversationId: payment.conversationId,
  eventType: "PAYMENT_VERIFICATION_SUCCEEDED",
  actor: "payment",
  summary: "Razorpay payment signature verified.",
  output: {
    paymentRecordId: getObjectIdString(payment),
    offerId: payment.offerId,
    razorpayOrderId: payment.razorpayOrderId,
    razorpayPaymentId: payment.razorpayPaymentId,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
  },
  operationKey: `audit:${payment.operationKey}:verification-succeeded`,
});

export const createPaymentVerificationFailedAuditInput = (
  payment: PaymentRecord,
  reason: string,
): Parameters<typeof createAuditEvent>[0] => ({
  conversationId: payment.conversationId,
  eventType: "PAYMENT_VERIFICATION_FAILED",
  actor: "payment",
  summary: "Razorpay payment verification failed.",
  reason,
  output: {
    paymentRecordId: getObjectIdString(payment),
    offerId: payment.offerId,
    razorpayOrderId: payment.razorpayOrderId,
    amount: payment.amount,
    currency: payment.currency,
    status: "verification_failed",
  },
  operationKey: `audit:${payment.operationKey}:verification-failed:${createHash("sha256")
    .update(reason)
    .digest("hex")
    .slice(0, 16)}`,
});

export const createPaymentOrder = async (
  input: CreatePaymentOrderInput,
): Promise<CreatePaymentOrderResult> => {
  const operationKey = buildPaymentOperationKey(
    input.offerId,
    input.idempotencyKey,
  );
  const existingPayment = await PaymentModel.findOne({
    $or: [{ operationKey }, { offerId: input.offerId }],
    status: { $in: PAYABLE_PAYMENT_STATUSES },
  })
    .lean<PaymentRecord>()
    .exec();

  if (existingPayment) {
    return toCreateOrderResult(existingPayment, getRazorpayKeyId());
  }

  const offer = await getOfferById(input.offerId);

  if (!offer) {
    throw new PaymentServiceError("Offer not found", 404);
  }

  assertOfferPayable(offer);

  const receipt = buildPaymentReceipt(operationKey, input.offerId);
  const razorpayOrder = await createRazorpayOrder({
    amount: offer.finalAmount,
    currency: offer.currency,
    receipt,
    notes: {
      conversationId: offer.conversationId,
      offerId: input.offerId,
      productId: offer.productId,
    },
  });
  const payment = await PaymentModel.create(
    buildPaymentRecordFromOffer({
      offer: {
        ...offer,
        _id: input.offerId,
      } as Offer,
      operationKey,
      receipt,
      razorpayOrderId: razorpayOrder.id,
    }),
  );
  const paymentObject = payment.toObject();

  await createAuditEvent(createRazorpayOrderCreatedAuditInput(paymentObject));

  return toCreateOrderResult(paymentObject, getRazorpayKeyId());
};

export const getPaymentById = async (
  paymentRecordId: string,
): Promise<SafePaymentRecord | null> => {
  const payment = await PaymentModel.findById(paymentRecordId)
    .lean<PaymentRecord>()
    .exec();

  return payment ? toSafePaymentRecord(payment) : null;
};

const markVerificationFailed = async (
  payment: PaymentRecord,
  reason: string,
): Promise<PaymentRecord> => {
  const updatedPayment = await PaymentModel.findByIdAndUpdate(
    getObjectIdString(payment),
    { $set: { status: "verification_failed" } },
    { returnDocument: "after", runValidators: true },
  )
    .lean<PaymentRecord>()
    .exec();
  const failedPayment =
    updatedPayment ?? ({ ...payment, status: "verification_failed" } as PaymentRecord);

  await createAuditEvent(
    createPaymentVerificationFailedAuditInput(failedPayment, reason),
  );

  return failedPayment;
};

export const verifyPayment = async (
  input: VerifyPaymentInput,
): Promise<SafePaymentRecord> => {
  const payment = await PaymentModel.findById(input.paymentRecordId)
    .lean<PaymentRecord>()
    .exec();

  if (!payment) {
    throw new PaymentServiceError("Payment record not found", 404);
  }

  if (payment.status === "verified") {
    if (
      payment.razorpayPaymentId &&
      payment.razorpayPaymentId !== input.razorpay_payment_id
    ) {
      throw new PaymentServiceError(
        "Payment record is already verified with a different payment id.",
        409,
      );
    }

    return toSafePaymentRecord(payment);
  }

  if (input.razorpay_order_id !== payment.razorpayOrderId) {
    await markVerificationFailed(payment, "Razorpay order id mismatch.");
    throw new PaymentServiceError("Razorpay order id does not match payment record.", 400);
  }

  const isValidSignature = verifyRazorpayPaymentSignature({
    razorpayOrderId: payment.razorpayOrderId,
    razorpayPaymentId: input.razorpay_payment_id,
    razorpaySignature: input.razorpay_signature,
  });

  if (!isValidSignature) {
    await markVerificationFailed(payment, "Invalid Razorpay payment signature.");
    throw new PaymentServiceError("Invalid Razorpay payment signature.", 400);
  }

  const verifiedPayment = await PaymentModel.findByIdAndUpdate(
    input.paymentRecordId,
    {
      $set: {
        status: "verified",
        razorpayPaymentId: input.razorpay_payment_id,
        verifiedAt: new Date(),
      },
    },
    { returnDocument: "after", runValidators: true },
  )
    .lean<PaymentRecord>()
    .exec();

  if (!verifiedPayment) {
    throw new PaymentServiceError("Payment record could not be verified.", 409);
  }

  await createAuditEvent(
    createPaymentVerificationSucceededAuditInput(verifiedPayment),
  );

  return toSafePaymentRecord(verifiedPayment);
};
