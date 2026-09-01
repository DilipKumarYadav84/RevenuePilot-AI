import type { Request, Response } from "express";
import type { ZodError } from "zod";

import {
  createPaymentOrder,
  getPaymentById,
  verifyPayment,
} from "./payment.service";
import {
  createPaymentOrderSchema,
  mongoIdSchema,
  verifyPaymentSchema,
} from "./payment.validation";

class PaymentValidationError extends Error {
  statusCode = 400;

  constructor(error: ZodError) {
    super(error.issues.map((issue) => issue.message).join("; "));
  }
}

const validateRequest = <T>(
  schema: { parse: (value: unknown) => T },
  value: unknown,
): T => {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new PaymentValidationError(error as ZodError);
  }
};

export const createPaymentOrderController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const input = validateRequest(createPaymentOrderSchema, req.body);
  const result = await createPaymentOrder(input);

  res.status(201).json({
    success: true,
    data: result,
  });
};

export const verifyPaymentController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const input = validateRequest(verifyPaymentSchema, req.body);
  const payment = await verifyPayment(input);

  res.status(200).json({
    success: true,
    data: payment,
  });
};

export const getPaymentController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const paymentRecordId = validateRequest(mongoIdSchema, req.params.id);
  const payment = await getPaymentById(paymentRecordId);

  if (!payment) {
    res.status(404).json({
      success: false,
      message: "Payment record not found",
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: payment,
  });
};
