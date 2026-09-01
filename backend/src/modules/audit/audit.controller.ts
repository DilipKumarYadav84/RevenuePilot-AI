import type { Request, Response } from "express";
import type { ZodError } from "zod";

import {
  getAuditEventsForConversation,
  queryAuditEvents,
} from "./audit.service";
import { auditQuerySchema, mongoIdSchema } from "./audit.validation";

class AuditValidationError extends Error {
  statusCode = 400;

  constructor(error: ZodError) {
    super(error.issues.map((issue) => issue.message).join("; "));
  }
}

const validateRequest = <T>(schema: { parse: (value: unknown) => T }, value: unknown): T => {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new AuditValidationError(error as ZodError);
  }
};

export const getConversationAuditController = async (
  req: Request<{ conversationId: string }>,
  res: Response,
): Promise<void> => {
  const conversationId = validateRequest(mongoIdSchema, req.params.conversationId);
  const events = await getAuditEventsForConversation(conversationId);

  res.status(200).json({
    success: true,
    data: events,
  });
};

export const queryAuditController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const filters = validateRequest(auditQuerySchema, req.query);
  const events = await queryAuditEvents(filters);

  res.status(200).json({
    success: true,
    count: events.length,
    data: events,
  });
};
