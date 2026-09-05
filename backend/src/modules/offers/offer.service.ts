import { createHash } from "node:crypto";

import { createAuditEvent, findMatchingActionProposalEvent } from "../audit/audit.service";
import { getConversationById } from "../conversations/conversation.service";
import { getActiveProductById } from "../products/product.service";
import { evaluateActionProposal, getActiveMerchantPolicy } from "../policies/policy.service";
import type { PolicyDecision } from "../policies/policy.types";
import { OfferModel } from "./offer.model";
import type { CreateCheckoutOfferInput, CreateOfferInput, Offer } from "./offer.types";

export class OfferServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const rupeesToPaise = (rupees: number): number =>
  Math.round(rupees * 100);

export const calculateDiscountAmounts = (
  originalAmountPaise: number,
  discountPercent: number,
): {
  discountAmount: number;
  finalAmount: number;
} => {
  const discountAmount = Math.round((originalAmountPaise * discountPercent) / 100);
  const finalAmount = Math.max(originalAmountPaise - discountAmount, 0);

  return {
    discountAmount,
    finalAmount,
  };
};

export const isOfferExpired = (
  offer: Pick<Offer, "expiresAt" | "status">,
  now = new Date(),
): boolean => offer.status === "created" && offer.expiresAt.getTime() <= now.getTime();

type ExecutableOfferInput = CreateOfferInput | CreateCheckoutOfferInput;

export const buildExecutionKey = (input: ExecutableOfferInput): string => {
  if (input.idempotencyKey) {
    return `offer:${input.idempotencyKey}`;
  }

  const requestedDiscountPercent =
    input.action === "CREATE_DISCOUNT" ? input.requestedDiscountPercent : "none";
  const rawKey = `${input.action}:${input.conversationId}:${input.productId}:${requestedDiscountPercent}`;
  return `offer:${createHash("sha256").update(rawKey).digest("hex")}`;
};

const getApprovedDiscountPercent = (decision: PolicyDecision): number | null => {
  if (decision.decision !== "APPROVED" && decision.decision !== "MODIFIED") {
    return null;
  }

  return decision.approvedAction?.approvedDiscountPercent ?? null;
};

export const canCreateOfferFromPolicyDecision = (
  decision: PolicyDecision,
): boolean => getApprovedDiscountPercent(decision) !== null;

export const createPolicyProposalFromProductPrice = (
  input: ExecutableOfferInput,
  productPrice: number,
): Parameters<typeof evaluateActionProposal>[0] => ({
  action: input.action,
  conversationId: input.conversationId,
  productId: input.productId,
  orderValue: productPrice,
  requestedDiscountPercent:
    input.action === "CREATE_DISCOUNT" ? input.requestedDiscountPercent : undefined,
  reason: "Offer creation request evaluated by Policy Engine.",
});

export const createOfferCreatedAuditInput = (
  offer: Offer,
): Parameters<typeof createAuditEvent>[0] => ({
  conversationId: offer.conversationId,
  eventType: "OFFER_CREATED",
  actor: "system",
  summary: `${offer.approvedDiscountPercent}% discount offer created.`,
  reason: offer.reason,
  output: {
    offerId: "_id" in offer ? String(offer._id) : undefined,
    productId: offer.productId,
    originalAmount: offer.originalAmount,
    requestedDiscountPercent: offer.requestedDiscountPercent,
    approvedDiscountPercent: offer.approvedDiscountPercent,
    discountAmount: offer.discountAmount,
    finalAmount: offer.finalAmount,
    amountUnit: offer.amountUnit,
    currency: offer.currency,
    policyDecision: offer.policyDecision,
    expiresAt: offer.expiresAt,
  },
  operationKey: `audit:${offer.executionKey}:created`,
});

export const createOfferAcceptedAuditInput = (
  offerId: string,
  offer: Offer,
): Parameters<typeof createAuditEvent>[0] => ({
  conversationId: offer.conversationId,
  eventType: "OFFER_ACCEPTED",
  actor: "customer",
  summary: "Customer accepted offer.",
  output: {
    offerId,
    finalAmount: offer.finalAmount,
    amountUnit: offer.amountUnit,
    currency: offer.currency,
  },
  operationKey: `audit:${offer.executionKey}:accepted`,
});

export const canAcceptOffer = (
  offer: Pick<Offer, "status" | "expiresAt">,
  now = new Date(),
): {
  allowed: boolean;
  reason?: string;
} => {
  if (isOfferExpired(offer, now)) {
    return {
      allowed: false,
      reason: "Offer is expired.",
    };
  }

  if (offer.status !== "created") {
    return {
      allowed: false,
      reason: `Offer cannot be accepted because it is ${offer.status}.`,
    };
  }

  return {
    allowed: true,
  };
};

export const createDiscountOffer = async (
  input: CreateOfferInput,
): Promise<{
  executed: boolean;
  offer: Offer | null;
  policyDecision: PolicyDecision;
}> => {
  const executionKey = buildExecutionKey(input);
  const existingOffer = await OfferModel.findOne({ executionKey })
    .lean<Offer>()
    .exec();

  if (existingOffer) {
    return {
      executed: true,
      offer: existingOffer,
      policyDecision: {
        decision: existingOffer.policyDecision,
        requestedAction: {
          action: input.action,
          conversationId: input.conversationId,
          productId: input.productId,
          requestedDiscountPercent: input.requestedDiscountPercent,
          orderValue: existingOffer.originalAmount / 100,
        },
        approvedAction: {
          action: input.action,
          approvedDiscountPercent: existingOffer.approvedDiscountPercent,
        },
        reason: "Existing offer returned for idempotent request.",
        requiresHumanApproval: false,
      },
    };
  }

  const conversation = await getConversationById(input.conversationId);

  if (!conversation) {
    throw new OfferServiceError("Conversation not found", 404);
  }

  const product = await getActiveProductById(input.productId);

  if (!product) {
    throw new OfferServiceError("Active product not found", 404);
  }

  // Provenance check: the discount request must trace back to a real
  // ACTION_PROPOSED audit event produced by the deterministic AI/policy
  // pipeline for this exact conversation, product, and discount percent.
  // This does NOT make the audit event financially authoritative - the
  // Policy Engine below still re-evaluates from scratch, and the price
  // above was already loaded fresh from MongoDB. It only proves a real
  // conversation turn produced this proposal, closing the path where a
  // client calls this endpoint directly with an arbitrary discount and
  // skips the AI/conversation flow entirely.
  const matchingProposal = await findMatchingActionProposalEvent({
    conversationId: input.conversationId,
    action: input.action,
    productId: input.productId,
    requestedDiscountPercent: input.requestedDiscountPercent,
  });

  if (!matchingProposal) {
    throw new OfferServiceError(
      "No matching AI-generated discount proposal was found for this conversation, product, and discount percent.",
      409,
    );
  }

  const policyDecision = await evaluateActionProposal(
    createPolicyProposalFromProductPrice(input, product.price),
  );
  const approvedDiscountPercent = getApprovedDiscountPercent(policyDecision);

  if (approvedDiscountPercent === null) {
    return {
      executed: false,
      offer: null,
      policyDecision,
    };
  }

  const policy = await getActiveMerchantPolicy();
  const originalAmount = rupeesToPaise(product.price);
  const { discountAmount, finalAmount } = calculateDiscountAmounts(
    originalAmount,
    approvedDiscountPercent,
  );
  const expiresAt = new Date(Date.now() + policy.offerExpiryMinutes * 60 * 1000);
  const offer = await OfferModel.create({
    conversationId: input.conversationId,
    productId: input.productId,
    actionType: input.action,
    requestedDiscountPercent: input.requestedDiscountPercent,
    approvedDiscountPercent,
    originalAmount,
    discountAmount,
    finalAmount,
    currency: "INR",
    amountUnit: "paise",
    policyDecision: policyDecision.decision,
    status: "created",
    reason: policyDecision.reason,
    expiresAt,
    executionKey,
  });
  const offerObject = offer.toObject();

  await createAuditEvent(createOfferCreatedAuditInput(offerObject));

  return {
    executed: true,
    offer: offerObject,
    policyDecision,
  };
};

export const createCheckoutOffer = async (
  input: CreateCheckoutOfferInput,
): Promise<{
  executed: boolean;
  offer: Offer | null;
  policyDecision: PolicyDecision;
}> => {
  const executionKey = buildExecutionKey(input);
  const existingOffer = await OfferModel.findOne({ executionKey })
    .lean<Offer>()
    .exec();

  if (existingOffer) {
    return {
      executed: true,
      offer: existingOffer,
      policyDecision: {
        decision: existingOffer.policyDecision,
        requestedAction: {
          action: input.action,
          conversationId: input.conversationId,
          productId: input.productId,
          orderValue: existingOffer.originalAmount / 100,
        },
        approvedAction: {
          action: input.action,
        },
        reason: "Existing checkout intent returned for idempotent request.",
        requiresHumanApproval: false,
      },
    };
  }

  const conversation = await getConversationById(input.conversationId);

  if (!conversation) {
    throw new OfferServiceError("Conversation not found", 404);
  }

  const product = await getActiveProductById(input.productId);

  if (!product) {
    throw new OfferServiceError("Active product not found", 404);
  }

  const matchingProposal = await findMatchingActionProposalEvent({
    conversationId: input.conversationId,
    action: input.action,
    productId: input.productId,
  });

  if (!matchingProposal) {
    throw new OfferServiceError(
      "No matching AI-generated checkout proposal was found for this conversation and product.",
      409,
    );
  }

  const policyDecision = await evaluateActionProposal(
    createPolicyProposalFromProductPrice(input, product.price),
  );

  if (policyDecision.decision !== "APPROVED") {
    return {
      executed: false,
      offer: null,
      policyDecision,
    };
  }

  const policy = await getActiveMerchantPolicy();
  const originalAmount = rupeesToPaise(product.price);
  const expiresAt = new Date(Date.now() + policy.offerExpiryMinutes * 60 * 1000);
  const offer = await OfferModel.create({
    conversationId: input.conversationId,
    productId: input.productId,
    actionType: input.action,
    requestedDiscountPercent: 0,
    approvedDiscountPercent: 0,
    originalAmount,
    discountAmount: 0,
    finalAmount: originalAmount,
    currency: "INR",
    amountUnit: "paise",
    policyDecision: policyDecision.decision,
    status: "accepted",
    reason: policyDecision.reason,
    expiresAt,
    executionKey,
  });
  const offerObject = offer.toObject();

  await createAuditEvent({
    ...createOfferCreatedAuditInput(offerObject),
    summary: "Checkout intent created.",
  });
  await createAuditEvent(createOfferAcceptedAuditInput(String(offerObject._id), offerObject));

  return {
    executed: true,
    offer: offerObject,
    policyDecision,
  };
};

export const getOfferById = async (offerId: string): Promise<Offer | null> => {
  return OfferModel.findById(offerId).lean<Offer>().exec();
};

export const getOffersForConversation = async (
  conversationId: string,
): Promise<Offer[]> => {
  return OfferModel.find({ conversationId })
    .sort({ createdAt: 1, _id: 1 })
    .lean<Offer[]>()
    .exec();
};

const markExpiredIfNeeded = async (offer: Offer): Promise<Offer> => {
  if (!isOfferExpired(offer)) {
    return offer;
  }

  const updatedOffer = await OfferModel.findOneAndUpdate(
    { executionKey: offer.executionKey, status: "created" },
    { $set: { status: "expired" } },
    { returnDocument: "after", runValidators: true },
  )
    .lean<Offer>()
    .exec();

  const expiredOffer = updatedOffer ?? {
    ...offer,
    status: "expired" as const,
  };

  await createAuditEvent({
    conversationId: expiredOffer.conversationId,
    eventType: "OFFER_EXPIRED",
    actor: "system",
    summary: "Offer expired before acceptance.",
    output: {
      offerId: "_id" in expiredOffer ? String(expiredOffer._id) : undefined,
      finalAmount: expiredOffer.finalAmount,
      amountUnit: expiredOffer.amountUnit,
      currency: expiredOffer.currency,
    },
    operationKey: `audit:${expiredOffer.executionKey}:expired`,
  });

  return expiredOffer;
};

export const acceptOffer = async (offerId: string): Promise<Offer> => {
  const offer = await getOfferById(offerId);

  if (!offer) {
    throw new OfferServiceError("Offer not found", 404);
  }

  const currentOffer = await markExpiredIfNeeded(offer);
  const acceptability = canAcceptOffer(currentOffer);

  if (!acceptability.allowed) {
    throw new OfferServiceError(
      acceptability.reason ?? "Offer cannot be accepted.",
      409,
    );
  }

  const acceptedOffer = await OfferModel.findOneAndUpdate(
    { _id: offerId, status: "created" },
    { $set: { status: "accepted" } },
    { returnDocument: "after", runValidators: true },
  )
    .lean<Offer>()
    .exec();

  if (!acceptedOffer) {
    throw new OfferServiceError("Offer could not be accepted", 409);
  }

  await createAuditEvent(createOfferAcceptedAuditInput(offerId, acceptedOffer));

  return acceptedOffer;
};

export const rejectOffer = async (offerId: string): Promise<Offer> => {
  const offer = await getOfferById(offerId);

  if (!offer) {
    throw new OfferServiceError("Offer not found", 404);
  }

  const currentOffer = await markExpiredIfNeeded(offer);

  if (currentOffer.status !== "created") {
    throw new OfferServiceError(
      `Offer cannot be rejected because it is ${currentOffer.status}.`,
      409,
    );
  }

  const rejectedOffer = await OfferModel.findOneAndUpdate(
    { _id: offerId, status: "created" },
    { $set: { status: "rejected" } },
    { returnDocument: "after", runValidators: true },
  )
    .lean<Offer>()
    .exec();

  if (!rejectedOffer) {
    throw new OfferServiceError("Offer could not be rejected", 409);
  }

  await createAuditEvent({
    conversationId: rejectedOffer.conversationId,
    eventType: "OFFER_REJECTED",
    actor: "customer",
    summary: "Customer rejected offer.",
    output: {
      offerId,
      finalAmount: rejectedOffer.finalAmount,
      amountUnit: rejectedOffer.amountUnit,
      currency: rejectedOffer.currency,
    },
    operationKey: `audit:${rejectedOffer.executionKey}:rejected`,
  });

  return rejectedOffer;
};
