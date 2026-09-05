import { type FormEvent, type KeyboardEvent, useEffect, useRef, useId } from "react";
import type { ConversationMessage } from "../../types/conversation";
import { MessageBubble } from "./MessageBubble";
import { StarterPrompts } from "./StarterPrompts";

export const ChatPanel = ({
  messages,
  draft,
  processing,
  disabled = false,
  onDraftChange,
  onSend,
}: {
  messages: ConversationMessage[];
  draft: string;
  processing: boolean;
  disabled?: boolean;
  onDraftChange: (value: string) => void;
  onSend: (message?: string) => void;
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const id = useId();

  useEffect(() => {
    if (messages.length === 0 && !processing) return;
    const panel = scrollRef.current;
    panel?.scrollTo({ top: panel.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
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
    <section className="chat-panel" aria-labelledby={`${id}-title`}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">TechNova shopping assistant</p>
          <h2 id={`${id}-title`}>RevenuePilot AI</h2>
        </div>
        <span className="ai-badge">AI guided</span>
      </div>

      <div ref={scrollRef} className="message-list" role="log" aria-live="polite" aria-label="Conversation">
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
      </div>

      {messages.length === 0 && <StarterPrompts disabled={processing || disabled} onSelect={onSend} />}

      <form className="chat-composer" onSubmit={handleSubmit}>
        <label htmlFor={`${id}-message`}>Message RevenuePilot AI</label>
        <textarea
          id={`${id}-message`}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={processing || disabled}
          placeholder="Ask for a product or respond to the recommendation..."
        />
        <button type="submit" disabled={processing || disabled || draft.trim().length === 0}>
          {processing ? "Sending..." : "Send"}
        </button>
      </form>
    </section>
  );
};
