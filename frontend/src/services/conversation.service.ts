import { apiRequest } from "./api-client";
import type {
  Conversation,
  ConversationMessage,
  ProcessConversationResult,
} from "../types/conversation";

export const createConversation = (): Promise<Conversation> =>
  apiRequest<Conversation>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      sessionId: `web_${crypto.randomUUID()}`,
    }),
  });

export const appendConversationMessage = (
  conversationId: string,
  message: Pick<ConversationMessage, "role" | "content">,
): Promise<Conversation> =>
  apiRequest<Conversation>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify(message),
    },
  );

export const processConversation = (
  conversationId: string,
): Promise<ProcessConversationResult> =>
  apiRequest<ProcessConversationResult>(
    `/api/conversations/${encodeURIComponent(conversationId)}/process`,
    {
      method: "POST",
    },
  );

export const getConversation = (conversationId: string): Promise<Conversation> =>
  apiRequest<Conversation>(
    `/api/conversations/${encodeURIComponent(conversationId)}`,
  );
