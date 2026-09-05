import type { CatalogResult } from "../../types/conversation";
import type { PaymentState } from "../../hooks/useRazorpayCheckout";
import type { Offer } from "../../types/payment";
import { formatPaiseAsInr, formatRupeesAsInr } from "../../utils/money";
import { useOfferCountdown } from "../../hooks/useOfferCountdown";

const specLabels: Record<string, string> = {
  processor: "Processor",
  ram: "RAM",
  storage: "Storage",
  display: "Display",
  graphics: "Graphics",
  battery: "Battery",
  weight: "Weight",
  operatingSystem: "Operating system",
  connectivity: "Connectivity",
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
    return "Matches the updated priority.";
  }

  if (normalized.includes("preference match")) {
    return "Matches stated preferences.";
  }

  if (normalized.includes("use-case match")) {
    return "Strong fit for the stated use case.";
  }

  if (normalized.includes("tag match")) {
    return "Matches your needs.";
  }

  return reason;
};

const getSpecSummary = (product: CatalogResult): string =>
  [
    product.specifications.graphics,
    product.specifications.ram,
    product.specifications.storage,
  ].filter(Boolean).join(" / ");

type ProductDetailsProps = {
  product: CatalogResult | null;
  offer: Offer | null;
  acceptedOffer: Offer | null;
  paymentState: PaymentState;
  preparingCheckout: boolean;
  actionLocked: boolean;
  acceptingOffer: boolean;
  onBuyNow: () => void;
  onAcceptOffer: () => void;
  onPay: () => void;
};

const getActionLabel = ({
  offer,
  acceptedOffer,
  paymentState,
  preparingCheckout,
}: Pick<
  ProductDetailsProps,
  "offer" | "acceptedOffer" | "paymentState" | "preparingCheckout"
>): string => {
  if (paymentState === "verified") {
    return "Payment verified";
  }

  if (paymentState === "verifying") {
    return "Verifying payment...";
  }

  if (paymentState === "loading_order" || preparingCheckout) {
    return "Preparing checkout...";
  }

  if (acceptedOffer) {
    return "Pay securely with Razorpay";
  }

  if (offer) {
    return `Accept ${offer.approvedDiscountPercent}% offer`;
  }

  return "Buy now";
};

export const ProductDetails = ({
  product,
  offer,
  acceptedOffer,
  paymentState,
  preparingCheckout,
  actionLocked,
  acceptingOffer,
  onBuyNow,
  onAcceptOffer,
  onPay,
}: ProductDetailsProps) => {
  const countdown = useOfferCountdown((offer ?? acceptedOffer)?.expiresAt);
  if (!product) {
    return null;
  }

  const isPaymentBusy =
    paymentState === "loading_order" ||
    paymentState === "checkout_open" ||
    paymentState === "verifying";
  const actionLabel = getActionLabel({
    offer,
    acceptedOffer,
    paymentState,
    preparingCheckout,
  });
  const isOfferCompatible = !offer || offer.productId === product.productId;
  const isAcceptedOfferCompatible =
    !acceptedOffer || acceptedOffer.productId === product.productId;
  const actionDisabled =
    preparingCheckout ||
    actionLocked ||
    acceptingOffer ||
    isPaymentBusy ||
    paymentState === "verified" ||
    ((offer !== null || acceptedOffer !== null) && countdown.expired) ||
    (offer !== null && !acceptedOffer && offer.status !== "created") ||
    !isOfferCompatible ||
    !isAcceptedOfferCompatible;
  const handlePrimaryAction = () => {
    if (acceptedOffer) {
      onPay();
      return;
    }

    if (offer) {
      onAcceptOffer();
      return;
    }

    onBuyNow();
  };

  return (
    <section className="context-card product-detail purchase-dock">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Selected product</p>
          <h2>{product.name}</h2>
          {getSpecSummary(product) && (
            <p className="product-hero-specs">{getSpecSummary(product)}</p>
          )}
        </div>
        <div className="product-price">{offer && <small>Original price</small>}<strong>{formatRupeesAsInr(product.price)}</strong></div>
      </div>

      {offer && (
        <div className={`selected-offer-summary ${offer.policyDecision.toLowerCase()}`}>
          <div>
            <span>AI proposed</span>
            <strong>{offer.requestedDiscountPercent}% off</strong>
          </div>
          <div>
            <span>Merchant policy</span>
            <strong>
              {offer.policyDecision === "MODIFIED"
                ? `${offer.requestedDiscountPercent}% → ${offer.approvedDiscountPercent}%`
                : offer.policyDecision}
            </strong>
          </div>
          <div>
            <span>You save</span>
            <strong>{formatPaiseAsInr(offer.discountAmount)}</strong>
          </div>
          <div>
            <span>Final price</span>
            <strong>{formatPaiseAsInr(offer.finalAmount)}</strong>
          </div>
        </div>
      )}

      <div className="spec-grid">
        {["processor", "ram", "storage", "battery"].filter(label => product.specifications[label]).map(label => (
          <div key={label}>
            <span>{specLabels[label] ?? label}</span>
            <strong>{product.specifications[label]}</strong>
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
            {product.matchReasons.slice(0, 2).map((reason) => (
              <li key={reason}>{humanizeReason(reason)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="product-purchase-action">
        {(offer || acceptedOffer) && paymentState !== "verified" && <p className={`offer-timer ${countdown.nearExpiry ? "warning" : ""}`}>
          {countdown.expired ? "Offer expired" : `${acceptedOffer ? "Accepted · Complete payment in" : "Offer expires in"} ${countdown.label}`}
        </p>}
        <button
          type="button"
          className="primary-action purchase-primary-action"
          disabled={actionDisabled}
          onClick={handlePrimaryAction}
        >
          {countdown.expired && (offer || acceptedOffer) && paymentState !== "verified" ? "Offer expired" : acceptingOffer ? "Accepting offer..." : paymentState === "checkout_open" ? "Checkout open" : actionLabel}
        </button>
      </div>
    </section>
  );
};
