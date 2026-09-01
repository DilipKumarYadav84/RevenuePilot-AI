import type { Request, Response } from "express";
import type { ZodError } from "zod";

import {
  evaluateActionProposal,
  getActiveMerchantPolicy,
  updateMerchantPolicy,
} from "./policy.service";
import {
  actionProposalSchema,
  merchantPolicyUpdateSchema,
} from "./policy.validation";

class PolicyValidationError extends Error {
  statusCode = 400;

  constructor(error: ZodError) {
    super(error.issues.map((issue) => issue.message).join("; "));
  }
}

const validateRequest = <T>(schema: { parse: (value: unknown) => T }, value: unknown): T => {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new PolicyValidationError(error as ZodError);
  }
};

export const getPolicyController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const policy = await getActiveMerchantPolicy();

  res.status(200).json({
    success: true,
    data: policy,
  });
};

export const updatePolicyController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const updates = validateRequest(merchantPolicyUpdateSchema, req.body);
  const policy = await updateMerchantPolicy(updates);

  res.status(200).json({
    success: true,
    data: policy,
  });
};

export const evaluatePolicyController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const proposal = validateRequest(actionProposalSchema, req.body);
  const decision = await evaluateActionProposal(proposal);

  res.status(200).json({
    success: true,
    data: decision,
  });
};
