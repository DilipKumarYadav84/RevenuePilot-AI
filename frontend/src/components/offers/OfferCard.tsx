import { useEffect, useMemo, useState } from "react";
import type { Offer } from "../../types/payment";
import { formatPaiseAsInr } from "../../utils/money";

const getRemainingSeconds = (expiresAt: string): number =>
  Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));

const formatRemaining = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
};

export const OfferCard = ({
  offer,
  accepting,
  accepted,
  onAccept,
}: {
  offer: Offer | null;
  accepting: boolean;
  accepted: boolean;
  onAccept: () => void;
}) => {
  const [remainingSeconds, setRemainingSeconds] = useState(
    offer ? getRemainingSeconds(offer.expiresAt) : 0,
  );

  useEffect(() => {
    if (!offer) {
      return undefined;
    }

    setRemainingSeconds(getRemainingSeconds(offer.expiresAt));
    const timer = window.setInterval(() => {
      setRemainingSeconds(getRemainingSeconds(offer.expiresAt));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [offer]);

  const expired = offer ? remainingSeconds <= 0 && offer.status === "created" : false;
  const canAccept = offer !== null && offer.status === "created" && !expired && !accepting;

  const rows = useMemo(() => {
    if (!offer) {
      return [];
    }

    return [
      ["Original", formatPaiseAsInr(offer.originalAmount)],
      ["Approved discount", `${offer.approvedDiscountPercent}%`],
      ["You save", formatPaiseAsInr(offer.discountAmount)],
      ["Final", formatPaiseAsInr(offer.finalAmount)],
    ];
  }, [offer]);

  if (!offer) {
    return (
      <section className="context-card muted-card">
        <h2>Policy-controlled offer</h2>
        <p>Offers appear only after RevenuePilot detects meaningful hesitation.</p>
      </section>
    );
  }

  return (
    <section className="context-card offer-card">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">TechNova merchant policy</p>
          <h2>TechNova can offer you {offer.approvedDiscountPercent}% off.</h2>
        </div>
        <span className={accepted ? "status-chip success" : "status-chip"}>
          {accepted ? "Accepted" : expired ? "Expired" : `Expires in ${formatRemaining(remainingSeconds)}`}
        </span>
      </div>

      <dl className="amount-list">
        {rows.map(([label, value]) => (
          <div key={label} className={label === "Final" ? "total-row" : ""}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <details className="policy-details">
        <summary>Why this offer?</summary>
        <p>
          RevenuePilot detected price hesitation and proposed an incentive.
          TechNova's merchant policy checked the action before this offer was
          created.
        </p>
      </details>

      <button type="button" disabled={!canAccept || accepted} onClick={onAccept}>
        {accepted ? "Offer accepted" : accepting ? "Accepting..." : "Accept offer"}
      </button>
    </section>
  );
};
