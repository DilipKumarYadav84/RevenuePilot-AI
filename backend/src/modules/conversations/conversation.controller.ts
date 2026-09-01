import type { Request, Response } from "express";
import type { ZodError } from "zod";

import {
  appendMessage,
  createConversation,
  getConversationById,
} from "./conversation.service";
import { processCustomerMessage } from "../ai/orchestrator.service";
import {
  createConversationSchema,
  mongoIdSchema,
  publicAppendMessageSchema,
} from "./conversation.validation";

class RequestValidationError extends Error {
  statusCode = 400;

  constructor(error: ZodError) {
    super(error.issues.map((issue) => issue.message).join("; "));
  }
}

const validateRequest = <T>(schema: { parse: (value: unknown) => T }, value: unknown): T => {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new RequestValidationError(error as ZodError);
  }
};

export const createConversationController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const input = validateRequest(createConversationSchema, req.body ?? {});
  const conversation = await createConversation(input);

  res.status(201).json({
    success: true,
    data: conversation,
  });
};

export const getConversationController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const conversationId = validateRequest(mongoIdSchema, req.params.id);
  const conversation = await getConversationById(conversationId);

  if (!conversation) {
    res.status(404).json({
      success: false,
      message: "Conversation not found",
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: conversation,
  });
};

export const appendConversationMessageController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const conversationId = validateRequest(mongoIdSchema, req.params.id);
  // Public clients may only ever author "customer" messages. This is the
  // sole enforcement point for that boundary — appendMessage() itself
  // remains role-agnostic so the orchestrator can still persist assistant
  // messages internally (see orchestrator.service.ts).
  const input = validateRequest(publicAppendMessageSchema, req.body);
  const conversation = await appendMessage(conversationId, input);

  res.status(200).json({
    success: true,
    data: conversation,
  });
};

export const processConversationController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const conversationId = validateRequest(mongoIdSchema, req.params.id);
  const result = await processCustomerMessage(conversationId);

  res.status(200).json({
    success: true,
    data: result,
  });
};
