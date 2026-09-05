import type { Request, Response } from "express";
import type { ZodError } from "zod";

import {
  acceptOffer,
  createCheckoutOffer,
  createDiscountOffer,
  getOfferById,
  getOffersForConversation,
  rejectOffer,
} from "./offer.service";
import { createCheckoutOfferSchema, createOfferSchema, mongoIdSchema } from "./offer.validation";

class OfferValidationError extends Error {
  statusCode = 400;

  constructor(error: ZodError) {
    super(error.issues.map((issue) => issue.message).join("; "));
  }
}

const validateRequest = <T>(schema: { parse: (value: unknown) => T }, value: unknown): T => {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new OfferValidationError(error as ZodError);
  }
};

export const createOfferController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const input = validateRequest(createOfferSchema, req.body);
  const result = await createDiscountOffer(input);

  res.status(result.executed ? 201 : 200).json({
    success: true,
    data: result,
  });
};

export const createCheckoutOfferController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const input = validateRequest(createCheckoutOfferSchema, req.body);
  const result = await createCheckoutOffer(input);

  res.status(result.executed ? 201 : 200).json({
    success: true,
    data: result,
  });
};

export const getOfferController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const offerId = validateRequest(mongoIdSchema, req.params.id);
  const offer = await getOfferById(offerId);

  if (!offer) {
    res.status(404).json({
      success: false,
      message: "Offer not found",
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: offer,
  });
};

export const getConversationOffersController = async (
  req: Request<{ conversationId: string }>,
  res: Response,
): Promise<void> => {
  const conversationId = validateRequest(mongoIdSchema, req.params.conversationId);
  const offers = await getOffersForConversation(conversationId);

  res.status(200).json({
    success: true,
    count: offers.length,
    data: offers,
  });
};

export const acceptOfferController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const offerId = validateRequest(mongoIdSchema, req.params.id);
  const offer = await acceptOffer(offerId);

  res.status(200).json({
    success: true,
    data: {
      offer,
      finalPayableAmount: offer.finalAmount,
      amountUnit: offer.amountUnit,
      currency: offer.currency,
    },
  });
};

export const rejectOfferController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const offerId = validateRequest(mongoIdSchema, req.params.id);
  const offer = await rejectOffer(offerId);

  res.status(200).json({
    success: true,
    data: offer,
  });
};
