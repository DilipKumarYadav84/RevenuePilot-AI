import type { CatalogResult } from "../../types/conversation";
import { formatRupeesAsInr } from "../../utils/money";

const getSpecSummary = (specifications: Record<string, string>): string[] =>
  [
    specifications.graphics,
    specifications.ram,
    specifications.processor,
    specifications.battery,
  ].filter(Boolean).slice(0, 3);

export const RecommendationCard = ({
  product,
  rank,
  selected,
  onSelect,
}: {
  product: CatalogResult;
  rank: number;
  selected: boolean;
  onSelect: () => void;
}) => {
  const specs = getSpecSummary(product.specifications);

  return (
    <button
      type="button"
      className={`recommendation-card ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <span className="match-label">{rank === 0 ? "Best match" : "Strong alternative"}</span>
      <strong>{product.name}</strong>
      <span>{formatRupeesAsInr(product.price)}</span>
      {specs.length > 0 && <small>{specs.join(" • ")}</small>}
    </button>
  );
};
