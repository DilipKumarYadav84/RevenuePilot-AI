import type { CatalogResult } from "../../types/conversation";
import { formatRupeesAsInr } from "../../utils/money";

const getSpecSummary = (specifications: Record<string, string>): string[] =>
  [
    specifications.graphics,
    specifications.ram,
    specifications.processor,
    specifications.battery,
  ].filter(Boolean).slice(0, 3);

const getTradeOff = (product: CatalogResult): string | null => {
  const battery = product.specifications.battery;
  const graphics = product.specifications.graphics;

  if (battery && graphics) {
    return `Trade-off: ${battery} with ${graphics}.`;
  }

  return null;
};

const humanizeReason = (reason: string): string => {
  const normalized = reason.toLowerCase();

  if (normalized.startsWith("category matches")) {
    return reason.replace("Category matches", "Matches");
  }

  if (normalized.startsWith("within budget")) {
    return "Within your budget.";
  }

  if (normalized.includes("priority preference match")) {
    return "Matches your current priority.";
  }

  if (normalized.includes("preference match")) {
    return "Matches stated preferences.";
  }

  if (normalized.includes("use-case match")) {
    return "Strong fit for your use case.";
  }

  if (normalized.includes("tag match")) {
    return "Matches your needs.";
  }

  return reason;
};

const getPrimaryReason = (product: CatalogResult): string | null =>
  product.matchReasons.find((reason) => {
    const normalized = reason.toLowerCase();
    return (
      !normalized.startsWith("category matches") &&
      !normalized.includes("tag match")
    );
  }) ?? product.matchReasons[0] ?? null;

export const RecommendationCard = ({
  product,
  rank,
  selected,
  onSelect,
  disabled = false,
}: {
  product: CatalogResult;
  rank: number;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) => {
  const specs = getSpecSummary(product.specifications);
  const tradeOff = getTradeOff(product);
  const primaryReason = getPrimaryReason(product);

  return (
    <button
      type="button"
      className={`recommendation-card ${selected ? "selected" : ""}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="match-label">{rank === 0 ? "Best Match" : "Strong Alternative"}</span>
      <div className="recommendation-title-row">
        <strong>{product.name}</strong>
        <span>{formatRupeesAsInr(product.price)}</span>
      </div>
      {primaryReason && <em>{humanizeReason(primaryReason)}</em>}
      {specs.length > 0 && <small>{specs.join(" / ")}</small>}
      {tradeOff && <small>{tradeOff}</small>}
      {selected && <span className="selected-label">Selected</span>}
    </button>
  );
};
