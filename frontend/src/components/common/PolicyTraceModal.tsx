import { useEffect, useState } from "react";
import { getPolicy } from "../../services/policy.service";
import type { CatalogResult, PolicyDecision } from "../../types/conversation";
import type { MerchantPolicy } from "../../types/merchant";
import type { Offer } from "../../types/payment";
import { formatPaiseAsInr } from "../../utils/money";
import { Modal } from "./Modal";

export const PolicyTraceModal = ({ policyDecision, selectedProduct, offer, onClose }: {
  policyDecision: PolicyDecision | null; selectedProduct: CatalogResult | null; offer: Offer | null; onClose: () => void;
}) => {
  const [policy, setPolicy] = useState<MerchantPolicy | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void getPolicy().then(value => { if (active) setPolicy(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  return <Modal title="Policy trace" onClose={onClose}>
    <header className="modal-heading"><div><p className="eyebrow">Decision inspector</p><h2>Policy trace</h2></div><button className="secondary-action" aria-label="Close trace" onClick={onClose}>Close</button></header>
    <p>AI proposes. Merchant policy decides what can run.</p>
    <dl className="tower-readout">
      <div><dt>Focused product</dt><dd>{selectedProduct?.name ?? "No product matched"}</dd></div>
      <div><dt>AI proposal</dt><dd>{policyDecision?.requestedAction.action ?? "No proposal"}
        {policyDecision?.requestedAction.requestedDiscountPercent !== undefined && <small>{policyDecision.requestedAction.requestedDiscountPercent}% requested</small>}</dd></div>
      <div><dt>Recorded decision</dt><dd><span className={`status-chip ${policyDecision?.decision.toLowerCase() ?? ""}`}>{policyDecision?.decision.replaceAll("_", " ") ?? "Waiting"}</span></dd></div>
    </dl>
    {policyDecision && <p>{policyDecision.reason}</p>}
    <h3>Current merchant rules</h3><p className="hint">Rules may have changed since the recorded decision.</p>
    {policy ? <dl className="insight-grid">
      <div><dt>Maximum discount</dt><dd>{policy.maxDiscountPercent}%</dd></div>
      <div><dt>Approval threshold</dt><dd>{policy.approvalThresholdPercent}%</dd></div>
      <div><dt>Offer lifetime</dt><dd>{policy.offerExpiryMinutes} minutes</dd></div>
      <div><dt>Discounts</dt><dd>{policy.allowDiscounts ? "Enabled" : "Disabled"}</dd></div>
      <div><dt>Checkout</dt><dd>{policy.allowCheckout ? "Enabled" : "Disabled"}</dd></div>
    </dl> : <p role="status">{failed ? "Current merchant rules are unavailable." : "Loading merchant rules..."}</p>}
    {offer ? <section className="trace-offer"><h3>Created offer</h3><dl className="amount-list">
      <div><dt>Original price</dt><dd>{formatPaiseAsInr(offer.originalAmount)}</dd></div>
      <div><dt>Approved discount</dt><dd>{offer.approvedDiscountPercent}%</dd></div>
      <div><dt>Final offer amount</dt><dd>{formatPaiseAsInr(offer.finalAmount)}</dd></div>
    </dl></section> : <p className="empty-copy">No offer has been created for this decision.</p>}
    <p className="hint">The merchant audit trail records decisions and payment verification.</p>
  </Modal>;
};
