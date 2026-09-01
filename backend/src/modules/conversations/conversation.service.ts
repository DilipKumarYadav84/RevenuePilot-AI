import { randomUUID } from "node:crypto";

import { Types } from "mongoose";

import { createAuditEvent, summarizeContent } from "../audit/audit.service";
import { ConversationModel } from "./conversation.model";
import type {
  AppendMessageInput,
  Conversation,
  ConversationMessage,
  ConversationStatus,
  CreateConversationInput,
  ExtractedConversationContext,
} from "./conversation.types";

export class ConversationServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

const toObjectIds = (ids: string[]): Types.ObjectId[] =>
  ids.map((id) => new Types.ObjectId(id));

export const createConversation = async (
  input: CreateConversationInput,
): Promise<Conversation> => {
  const conversationData: Partial<Conversation> & Pick<Conversation, "sessionId"> = {
    sessionId: input.sessionId ?? randomUUID(),
    extractedContext: input.extractedContext ?? {},
    status: "active",
    messages: [],
    recommendedProductIds: [],
  };

  if (input.customerId) {
    conversationData.customerId = input.customerId;
  }

  const conversation = new ConversationModel(conversationData);
  const savedConversation = await conversation.save();
  const savedObject = savedConversation.toObject();

  await createAuditEvent({
    conversationId: savedObject._id?.toString() ?? savedConversation.id,
    sessionId: savedObject.sessionId,
    eventType: "CONVERSATION_STARTED",
    actor: "system",
    summary: "Conversation started.",
    metadata: {
      status: savedObject.status,
      hasCustomerId: Boolean(savedObject.customerId),
    },
    operationKey: `conversation:${savedConversation.id}:started`,
  });

  return savedObject;
};

export const getConversationById = async (
  conversationId: string,
): Promise<Conversation | null> => {
  return ConversationModel.findById(conversationId).lean<Conversation>().exec();
};

export const appendMessage = async (
  conversationId: string,
  input: AppendMessageInput,
): Promise<Conversation> => {
  const message: ConversationMessage = {
    role: input.role,
    content: input.content,
    timestamp: new Date(),
  };

  if (input.metadata) {
    message.metadata = input.metadata;
  }

  const conversation = await ConversationModel.findByIdAndUpdate(
    conversationId,
    {
      $push: {
        messages: message,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  )
    .lean<Conversation>()
    .exec();

  if (!conversation) {
    throw new ConversationServiceError("Conversation not found", 404);
  }

  if (input.role === "customer") {
    await createAuditEvent({
      conversationId,
      sessionId: conversation.sessionId,
      eventType: "CUSTOMER_MESSAGE_RECEIVED",
      actor: "customer",
      summary: `Customer message received: ${summarizeContent(input.content)}`,
      input: {
        content: summarizeContent(input.content),
      },
      operationKey: `conversation:${conversationId}:customer:${message.timestamp.toISOString()}:${summarizeContent(
        input.content,
      )}`,
    });
  }

  if (input.role === "assistant") {
    await createAuditEvent({
      conversationId,
      sessionId: conversation.sessionId,
      eventType: "ASSISTANT_MESSAGE_CREATED",
      actor: "assistant",
      summary: `Assistant response created: ${summarizeContent(input.content)}`,
      metadata: input.metadata,
      operationKey: `conversation:${conversationId}:assistant:${message.timestamp.toISOString()}:${summarizeContent(
        input.content,
      )}`,
    });
  }

  return conversation;
};

export const updateExtractedContext = async (
  conversationId: string,
  context: ExtractedConversationContext,
): Promise<Conversation> => {
  const conversation = await ConversationModel.findByIdAndUpdate(
    conversationId,
    {
      $set: {
        extractedContext: {
          ...context,
          lastUpdatedAt: context.lastUpdatedAt ?? new Date(),
        },
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  )
    .lean<Conversation>()
    .exec();

  if (!conversation) {
    throw new ConversationServiceError("Conversation not found", 404);
  }

  return conversation;
};

export const setRecommendedProducts = async (
  conversationId: string,
  productIds: string[],
): Promise<Conversation> => {
  const conversation = await ConversationModel.findByIdAndUpdate(
    conversationId,
    {
      $set: {
        recommendedProductIds: toObjectIds(productIds),
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  )
    .lean<Conversation>()
    .exec();

  if (!conversation) {
    throw new ConversationServiceError("Conversation not found", 404);
  }

  return conversation;
};

export const updateConversationStatus = async (
  conversationId: string,
  status: ConversationStatus,
): Promise<Conversation> => {
  const conversation = await ConversationModel.findByIdAndUpdate(
    conversationId,
    {
      $set: {
        status,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  )
    .lean<Conversation>()
    .exec();

  if (!conversation) {
    throw new ConversationServiceError("Conversation not found", 404);
  }

  return conversation;
};
