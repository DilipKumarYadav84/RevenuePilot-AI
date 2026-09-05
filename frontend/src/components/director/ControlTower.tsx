import { useEffect, useState } from "react";
import type { JourneySnapshot } from "../customer/CustomerExperience";
import type { AuditEvent } from "../../types/audit";
import type { MerchantPolicy } from "../../types/merchant";
import { getConversationAudit } from "../../services/audit.service";
import { getPolicy } from "../../services/policy.service";
import { formatPaiseAsInr } from "../../utils/money";
import { AuditTimeline } from "../common/AuditTimeline";
import { useOfferCountdown } from "../../hooks/useOfferCountdown";

const paymentLabels = { idle: "Waiting", loading_order: "Preparing order", checkout_open: "Awaiting payment",
  verifying: "Verifying payment", verified: "Payment verified", failed: "Not completed" };

export const ControlTower = ({ journey }: { journey: JourneySnapshot }) => {
  const [data, setData] = useState<{ key: string; events: AuditEvent[]; policy: MerchantPolicy | null; error: boolean } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const key = `${journey.conversationId}:${journey.revision}:${refresh}`;
  useEffect(() => {
    let active = true;
    void Promise.all([journey.conversationId ? getConversationAudit(journey.conversationId) : Promise.resolve([]), getPolicy()])
      .then(([events, policy]) => { if (active) setData({ key, events, policy, error: false }); })
      .catch(() => { if (active) setData({ key, events: [], policy: null, error: true }); });
    return () => { active = false; };
  }, [key, journey.conversationId]);
  const decision = journey.policyDecision;
  const offer = journey.acceptedOffer ?? journey.offer;
  const countdown = useOfferCountdown(offer?.expiresAt);
  const requested = decision?.requestedAction.requestedDiscountPercent;
  const approved = decision?.approvedAction?.approvedDiscountPercent;
  return <aside className="control-tower" aria-label="RevenuePilot Control Tower">
    <div className="panel-heading"><div><p className="eyebrow">Director Dual-View</p><h2>RevenuePilot Control Tower</h2></div>
      <button type="button" className="secondary-action" onClick={() => setRefresh(value => value + 1)}>Refresh</button></div>
    <p className="hint">Decisions from this shopper journey. Audit updates after each action.</p>
    <dl className="tower-readout">
      <div><dt>Customer state</dt><dd>{journey.context?.customerState?.replaceAll("_", " ") ?? "Waiting for a message"}</dd></div>
      <div><dt>Focused product</dt><dd>{journey.selectedProduct?.name ?? "No product selected"}</dd></div>
      <div><dt>AI proposal</dt><dd>{decision?.requestedAction.action ?? "Waiting"}{requested !== undefined && <small>Requested: {requested}%</small>}</dd></div>
      <div><dt>Merchant policy</dt><dd>{data?.policy ? <>Maximum discount: {data.policy.maxDiscountPercent}%<small>Approval threshold: {data.policy.approvalThresholdPercent}%</small></> : data?.error ? "Unavailable" : "Loading..."}</dd></div>
      <div className={`tower-decision ${decision?.decision.toLowerCase() ?? ""}`}><dt>Decision</dt><dd>{decision?.decision.replaceAll("_", " ") ?? "Waiting"}
        {requested !== undefined && approved !== undefined && <small>{requested}% → {approved}%</small>}</dd></div>
      <div><dt>Offer</dt><dd>{offer ? <>{formatPaiseAsInr(offer.finalAmount)}<small>{journey.paymentState !== "verified" && countdown.expired ? "Expired" : offer.status === "accepted" ? "Accepted" : "Awaiting acceptance"}</small></> : "No offer created"}</dd></div>
      <div><dt>Payment</dt><dd className={journey.paymentState === "verified" ? "success-text" : ""}>{paymentLabels[journey.paymentState]}</dd></div>
    </dl>
    <div className="tower-audit"><p className="eyebrow">Audit stream</p>
      <AuditTimeline events={data?.key === key ? data.events : []} loading={data?.key !== key} error={data?.error} />
    </div>
  </aside>;
};
