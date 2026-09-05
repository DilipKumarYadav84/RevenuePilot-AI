import type { AuditEvent } from "../../types/audit";
import { formatPaiseAsInr } from "../../utils/money";

const eventTitles: Record<string, string> = {
  CONVERSATION_STARTED: "Journey started", CUSTOMER_MESSAGE_RECEIVED: "Customer message received",
  INTENT_DETECTED: "Intent detected", CUSTOMER_STATE_UPDATED: "Customer state updated",
  CATALOG_SEARCHED: "Catalog searched", PRODUCT_RECOMMENDED: "Product matched",
  ASSISTANT_MESSAGE_CREATED: "Recommendation explained", ACTION_PROPOSED: "AI proposed an action",
  POLICY_APPROVED: "Policy approved", POLICY_MODIFIED: "Policy modified", POLICY_BLOCKED: "Policy blocked",
  POLICY_REQUIRES_APPROVAL: "Automatic execution stopped", OFFER_CREATED: "Offer created",
  OFFER_ACCEPTED: "Offer accepted", OFFER_REJECTED: "Offer rejected", OFFER_EXPIRED: "Offer expired",
  RAZORPAY_ORDER_CREATED: "Razorpay order created", PAYMENT_VERIFICATION_SUCCEEDED: "Payment verified",
  PAYMENT_VERIFICATION_FAILED: "Payment verification failed",
};
const category = (event: AuditEvent) => {
  if (event.eventType === "PAYMENT_VERIFICATION_FAILED") return "SECURITY";
  if (event.eventType.startsWith("POLICY")) return "POLICY";
  if (event.eventType.startsWith("OFFER")) return "OFFER";
  if (event.actor === "payment") return "RAZORPAY";
  if (event.actor === "customer" || event.eventType === "CONVERSATION_STARTED") return "CUSTOMER";
  return "AI";
};
const detail = (event: AuditEvent) => {
  const output = event.output;
  if (event.eventType === "ACTION_PROPOSED") {
    return `${String(output?.action ?? "Action proposed")}${typeof output?.requestedDiscountPercent === "number" ? ` · ${output.requestedDiscountPercent}%` : ""}`;
  }
  if (event.eventType === "POLICY_MODIFIED") {
    const approved = output?.approvedAction as { approvedDiscountPercent?: number } | undefined;
    if (typeof event.input?.requestedDiscountPercent === "number" && typeof approved?.approvedDiscountPercent === "number")
      return `${event.input.requestedDiscountPercent}% → ${approved.approvedDiscountPercent}%`;
  }
  const amount = output?.finalAmount ?? output?.amount;
  if (typeof amount === "number") return formatPaiseAsInr(amount);
  return event.summary;
};
export const AuditTimeline = ({ events, loading = false, error = false }: {
  events: AuditEvent[]; loading?: boolean; error?: boolean;
}) => <div className="audit-timeline" aria-label="Audit timeline">
  {loading ? <p role="status">Loading journey decisions...</p> : error ? <p role="alert">Unable to load audit records. Refresh to retry.</p>
    : events.length === 0 ? <p className="empty-copy">RevenuePilot decisions will appear here as the shopper journey progresses.</p>
    : events.map((event, index) => <article key={`${event.eventType}-${event.createdAt}-${index}`} className={`audit-event audit-${category(event).toLowerCase()}`}>
      <span className="actor-badge">{category(event)}</span>
      <div><strong>{eventTitles[event.eventType] ?? "Journey event"}</strong><p>{detail(event)}</p>
        {event.createdAt && <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>}
      </div>
    </article>)}
</div>;
