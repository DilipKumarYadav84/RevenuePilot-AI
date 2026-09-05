import type { PolicyDecision } from "../../types/conversation";

export const OfferCard = ({ policyDecision }: { policyDecision: PolicyDecision | null }) => {
  if (!policyDecision || !["BLOCKED", "REQUIRES_APPROVAL"].includes(policyDecision.decision)
    || policyDecision.requestedAction.action === "NO_ACTION") return null;
  return <section className={`context-card policy-notice ${policyDecision.decision.toLowerCase()}`}>
    <span className={`status-chip ${policyDecision.decision.toLowerCase()}`}>{policyDecision.decision.replaceAll("_", " ")}</span>
    <h3>{policyDecision.decision === "BLOCKED" ? "This action is blocked by merchant policy" : "This offer cannot run automatically"}</h3>
    <p>{policyDecision.reason}</p>
  </section>;
};
