import type { ConversationMessage } from "../../types/conversation";

export const MessageBubble = ({ message }: { message: ConversationMessage }) => (
  <article className={`message-bubble message-${message.role}`}>
    <span>{message.role === "customer" ? "You" : "RevenuePilot AI"}</span>
    <p>{message.content}</p>
  </article>
);
