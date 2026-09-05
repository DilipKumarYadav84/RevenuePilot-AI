const prompts = [
  "Find me an AI laptop under INR 70,000",
  "I need something portable for college",
  "Show me the best laptop for full-stack development",
];

export const StarterPrompts = ({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (prompt: string) => void;
}) => (
  <div className="starter-prompts" aria-label="Starter prompts">
    {prompts.map((prompt) => (
      <button
        key={prompt}
        type="button"
        disabled={disabled}
        onClick={() => onSelect(prompt)}
      >
        {prompt}
      </button>
    ))}
  </div>
);
