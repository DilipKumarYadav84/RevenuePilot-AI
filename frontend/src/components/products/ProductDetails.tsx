import type { CatalogResult } from "../../types/conversation";
import { formatRupeesAsInr } from "../../utils/money";

export const ProductDetails = ({ product }: { product: CatalogResult | null }) => {
  if (!product) {
    return (
      <section className="context-card muted-card">
        <h2>Recommendations</h2>
        <p>Start a conversation to see catalog-backed product guidance.</p>
      </section>
    );
  }

  return (
    <section className="context-card product-detail">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Selected product</p>
          <h2>{product.name}</h2>
        </div>
        <strong>{formatRupeesAsInr(product.price)}</strong>
      </div>

      <div className="spec-grid">
        {Object.entries(product.specifications).slice(0, 5).map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      {product.useCases.length > 0 && (
        <div className="pill-row">
          {product.useCases.slice(0, 3).map((useCase) => (
            <span key={useCase}>{useCase}</span>
          ))}
        </div>
      )}

      {product.matchReasons.length > 0 && (
        <div className="why-box">
          <h3>Why RevenuePilot picked this</h3>
          <ul>
            {product.matchReasons.slice(0, 4).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
