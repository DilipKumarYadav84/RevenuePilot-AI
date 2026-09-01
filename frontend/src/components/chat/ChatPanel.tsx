import { type FormEvent, type KeyboardEvent, useEffect, useRef } from "react";
import type { ConversationMessage } from "../../types/conversation";
import { MessageBubble } from "./MessageBubble";
import { StarterPrompts } from "./StarterPrompts";

export const ChatPanel = ({
  messages,
  draft,
  processing,
  onDraftChange,
  onSend,
}: {
  messages: ConversationMessage[];
  draft: string;
  processing: boolean;
  onDraftChange: (value: string) => void;
  onSend: (message?: string) => void;
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, processing]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSend();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <section className="chat-panel" aria-labelledby="chat-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">TechNova shopping assistant</p>
          <h2 id="chat-title">RevenuePilot AI</h2>
        </div>
        <span className="ai-badge">AI guided</span>
      </div>

      <div className="message-list" aria-live="polite">
        {messages.length === 0 ? (
          <div className="welcome-message">
            <h3>Tell RevenuePilot what you need.</h3>
            <p>
              It will search TechNova's catalog, explain the fit, and only offer
              incentives after merchant policy checks.
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <MessageBubble key={`${message.role}-${index}`} message={message} />
          ))
        )}
        {processing && (
          <div className="thinking-state">
            RevenuePilot is analyzing your needs...
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <StarterPrompts disabled={processing} onSelect={onSend} />

      <form className="chat-composer" onSubmit={handleSubmit}>
        <label htmlFor="customer-message">Message RevenuePilot AI</label>
        <textarea
          id="customer-message"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={processing}
          placeholder="Ask for a product or respond to the recommendation..."
        />
        <button type="submit" disabled={processing || draft.trim().length === 0}>
          {processing ? "Sending..." : "Send"}
        </button>
      </form>
    </section>
  );
};
