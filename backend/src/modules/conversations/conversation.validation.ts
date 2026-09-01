import { Types } from "mongoose";
import { z } from "zod";

const nonEmptyTrimmedString = z.string().trim().min(1);

const optionalIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .optional();

export const mongoIdSchema = z
  .string()
  .trim()
  .refine((value) => Types.ObjectId.isValid(value), {
    message: "Invalid MongoDB ObjectId",
  });

export const conversationStatusSchema = z.enum([
  "active",
  "converted",
  "abandoned",
  "closed",
]);

export const conversationMessageRoleSchema = z.enum([
  "customer",
  "assistant",
  "system",
  "tool",
]);

const productCategorySchema = z.enum([
  "laptop",
  "monitor",
  "keyboard",
  "mouse",
  "headphones",
  "accessory",
]);

const intentLevelSchema = z.enum(["low", "medium", "high"]);

export const extractedContextSchema = z
  .object({
    intent: z.string().trim().min(1).nullable().optional(),
    category: productCategorySchema.nullable().optional(),
    budget: z.number().min(0).nullable().optional(),
    useCases: z.array(nonEmptyTrimmedString).optional(),
    preferences: z.array(nonEmptyTrimmedString).optional(),
    priceSensitivity: intentLevelSchema.nullable().optional(),
    purchaseIntent: intentLevelSchema.nullable().optional(),
    abandonmentRisk: intentLevelSchema.nullable().optional(),
    customerState: z
      .enum(["browsing", "comparing", "hesitating", "ready_to_buy", "unknown"])
      .optional(),
    lastUpdatedAt: z.coerce.date().nullable().optional(),
  })
  .strict();

export const createConversationSchema = z
  .object({
    sessionId: optionalIdentifierSchema,
    customerId: optionalIdentifierSchema,
    extractedContext: extractedContextSchema.optional(),
  })
  .strict();

export const appendMessageSchema = z
  .object({
    role: conversationMessageRoleSchema,
    content: nonEmptyTrimmedString,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

// Public HTTP clients may only ever author "customer" messages. Assistant/
// system/tool messages must only be written by trusted internal callers
// (the orchestrator), never accepted verbatim from a request body — see
// publicAppendMessageSchema usage in conversation.controller.ts.
export const publicAppendMessageSchema = z
  .object({
    role: z.literal("customer"),
    content: nonEmptyTrimmedString,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const recommendedProductIdsSchema = z
  .array(mongoIdSchema)
  .max(12)
  .refine((productIds) => new Set(productIds).size === productIds.length, {
    message: "Recommended product ids must be unique",
  });
