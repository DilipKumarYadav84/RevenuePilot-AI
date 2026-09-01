import type { Request, Response } from "express";
import type { ZodError } from "zod";

import { mongoIdSchema } from "../audit/audit.validation";
import {
  getDashboardConversationAudit,
  getDashboardSummary,
} from "./dashboard.service";

class DashboardValidationError extends Error {
  statusCode = 400;

  constructor(error: ZodError) {
    super(error.issues.map((issue) => issue.message).join("; "));
  }
}

const validateRequest = <T>(schema: { parse: (value: unknown) => T }, value: unknown): T => {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new DashboardValidationError(error as ZodError);
  }
};

export const getDashboardSummaryController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const summary = await getDashboardSummary();

  res.status(200).json({
    success: true,
    data: summary,
  });
};

export const getDashboardConversationAuditController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const conversationId = validateRequest(mongoIdSchema, req.params.conversationId);
  const events = await getDashboardConversationAudit(conversationId);

  res.status(200).json({
    success: true,
    data: events,
  });
};
