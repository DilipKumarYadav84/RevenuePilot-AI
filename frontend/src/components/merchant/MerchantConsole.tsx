import { type FormEvent, useEffect, useMemo, useState } from "react";

import { getConversationAudit } from "../../services/audit.service";
import { getDashboardSummary } from "../../services/dashboard.service";
import { getPolicy, updatePolicy } from "../../services/policy.service";
import type { AuditEvent, AuditEventType } from "../../types/audit";
import type {
  DashboardConversationSummary,
  DashboardSummary,
  MerchantPolicy,
  MerchantPolicyUpdate,
} from "../../types/merchant";
import { formatPaiseAsInr } from "../../utils/money";

type DashboardSection = "overview" | "conversations" | "offers" | "payments" | "policy" | "audit";

type PolicyFormState = {
  maxDiscountPercent: string;
  approvalThresholdPercent: string;
  minimumOrderAmount: string;
  maximumOffersPerConversation: string;
  offerExpiryMinutes: string;
  allowDiscounts: boolean;
  allowBundles: boolean;
  allowAlternativeProducts: boolean;
  allowCheckout: boolean;
};

const sectionLabels: Record<DashboardSection, string> = {
  overview: "Overview",
  conversations: "Live Conversations",
  offers: "Offers",
  payments: "Payments",
  policy: "Policy",
  audit: "Audit Trail",
};

const eventLabels: Record<AuditEventType, string> = {
  CONVERSATION_STARTED: "Conversation started",
  CUSTOMER_MESSAGE_RECEIVED: "Customer message received",
  ASSISTANT_MESSAGE_CREATED: "Assistant response created",
  INTENT_DETECTED: "AI understood customer intent",
  CUSTOMER_STATE_UPDATED: "Customer state updated",
  CATALOG_SEARCHED: "Catalog searched",
  PRODUCT_RECOMMENDED: "Product recommended",
  ACTION_PROPOSED: "AI proposed an action",
  POLICY_APPROVED: "Merchant policy approved AI action",
  POLICY_MODIFIED: "Merchant policy modified AI action",
  POLICY_BLOCKED: "Merchant policy blocked AI action",
  POLICY_REQUIRES_APPROVAL: "Merchant policy requires approval",
  OFFER_CREATED: "Offer created",
  OFFER_ACCEPTED: "Customer accepted offer",
  OFFER_REJECTED: "Customer rejected offer",
  OFFER_EXPIRED: "Offer expired",
  RAZORPAY_ORDER_CREATED: "Razorpay order created",
  PAYMENT_VERIFICATION_SUCCEEDED: "Payment verified",
  PAYMENT_VERIFICATION_FAILED: "Payment verification failed",
};

const actorIcons: Record<string, string> = {
  customer: "C",
  assistant: "A",
  ai: "AI",
  catalog: "P",
  policy_engine: "G",
  system: "S",
  merchant: "M",
  payment: "R",
};

const stateLabels: Record<string, string> = {
  browsing: "Browsing",
  comparing: "Comparing",
  hesitating: "Considering value",
  ready_to_buy: "Ready to buy",
  unknown: "Unknown",
};

const toPolicyFormState = (policy: MerchantPolicy): PolicyFormState => ({
  maxDiscountPercent: String(policy.maxDiscountPercent),
  approvalThresholdPercent: String(policy.approvalThresholdPercent),
  minimumOrderAmount: String(policy.minimumOrderAmount),
  maximumOffersPerConversation: String(policy.maximumOffersPerConversation),
  offerExpiryMinutes: String(policy.offerExpiryMinutes),
  allowDiscounts: policy.allowDiscounts,
  allowBundles: policy.allowBundles,
  allowAlternativeProducts: policy.allowAlternativeProducts,
  allowCheckout: policy.allowCheckout,
});

const shortId = (value: string): string => `${value.slice(0, 6)}...${value.slice(-6)}`;

const formatDate = (value?: string): string =>
  value ? new Date(value).toLocaleString() : "Not available";

const conversionRate = (value: number, base: number): string => {
  if (base <= 0) {
    return "0%";
  }

  return `${Math.round((value / base) * 1000) / 10}%`;
};

const getNumber = (value: string): number => Number(value);

const buildPolicyUpdate = (form: PolicyFormState): MerchantPolicyUpdate => ({
  maxDiscountPercent: getNumber(form.maxDiscountPercent),
  approvalThresholdPercent: getNumber(form.approvalThresholdPercent),
  minimumOrderAmount: getNumber(form.minimumOrderAmount),
  maximumOffersPerConversation: getNumber(form.maximumOffersPerConversation),
  offerExpiryMinutes: getNumber(form.offerExpiryMinutes),
  allowDiscounts: form.allowDiscounts,
  allowBundles: form.allowBundles,
  allowAlternativeProducts: form.allowAlternativeProducts,
  allowCheckout: form.allowCheckout,
});

const validatePolicyForm = (form: PolicyFormState): string | null => {
  const maxDiscount = getNumber(form.maxDiscountPercent);
  const approvalThreshold = getNumber(form.approvalThresholdPercent);
  const minimumOrderAmount = getNumber(form.minimumOrderAmount);
  const maximumOffers = getNumber(form.maximumOffersPerConversation);
  const offerExpiry = getNumber(form.offerExpiryMinutes);

  if ([maxDiscount, approvalThreshold, minimumOrderAmount, maximumOffers, offerExpiry].some(Number.isNaN)) {
    return "All policy numbers must be valid.";
  }

  if (maxDiscount < 0 || maxDiscount > 100 || approvalThreshold < 0 || approvalThreshold > 100) {
    return "Discount percentages must be between 0 and 100.";
  }

  if (approvalThreshold >= maxDiscount) {
    return "Approval threshold must be strictly less than maximum discount.";
  }

  if (!Number.isInteger(maximumOffers) || maximumOffers < 0) {
    return "Maximum offers must be a whole number of 0 or more.";
  }

  if (!Number.isInteger(offerExpiry) || offerExpiry < 1) {
    return "Offer expiry must be at least 1 minute.";
  }

  if (minimumOrderAmount < 0) {
    return "Minimum order amount cannot be negative.";
  }

  return null;
};

const getPolicyStory = (events: AuditEvent[]): string | null => {
  const modified = events.find((event) => event.eventType === "POLICY_MODIFIED");
  const proposed = events.find((event) => event.eventType === "ACTION_PROPOSED");

  if (!modified) {
    return null;
  }

  const requested = proposed?.output?.requestedDiscountPercent;
  const approved = modified.output?.approvedAction;
  const approvedPercent =
    typeof approved === "object" &&
    approved !== null &&
    "approvedDiscountPercent" in approved
      ? approved.approvedDiscountPercent
      : undefined;

  return `AI proposal ${typeof requested === "number" ? `${requested}%` : "reviewed"} -> merchant guardrail -> approved offer ${
    typeof approvedPercent === "number" ? `${approvedPercent}%` : "capped"
  }. ${modified.reason ?? ""}`.trim();
};

export const MerchantConsole = () => {
  const [activeSection, setActiveSection] = useState<DashboardSection>("overview");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [policy, setPolicy] = useState<MerchantPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState<PolicyFormState | null>(null);
  const [selectedConversation, setSelectedConversation] =
    useState<DashboardConversationSummary | null>(null);
  const [conversationAudit, setConversationAudit] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);
  // Buildathon-demo-only: held in memory for this session only, never
  // persisted (no localStorage), never read from a bundled env var, and
  // never sent anywhere except the PATCH /api/policies request below. This
  // is NOT production auth — see backend/src/middleware/merchantAuth.middleware.ts.
  const [merchantKeyInput, setMerchantKeyInput] = useState("");

  const refresh = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [nextSummary, nextPolicy] = await Promise.all([
        getDashboardSummary(),
        getPolicy(),
      ]);
      setSummary(nextSummary);
      setPolicy(nextPolicy);
      setPolicyForm(toPolicyFormState(nextPolicy));
      setSelectedConversation((current) =>
        current
          ? nextSummary.recentConversations.find((item) => item.id === current.id) ?? current
          : nextSummary.recentConversations[0] ?? null,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Merchant dashboard could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!selectedConversation) {
      setConversationAudit([]);
      return;
    }

    let active = true;
    getConversationAudit(selectedConversation.id)
      .then((events) => {
        if (active) {
          setConversationAudit(events);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : "Audit trail could not be loaded.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [selectedConversation]);

  const policyStory = useMemo(
    () => getPolicyStory(conversationAudit),
    [conversationAudit],
  );

  const handlePolicySave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!policyForm) {
      return;
    }

    const validationError = validatePolicyForm(policyForm);

    if (validationError) {
      setPolicyMessage(validationError);
      return;
    }

    setSavingPolicy(true);
    setPolicyMessage(null);

    try {
      const updatedPolicy = await updatePolicy(
        buildPolicyUpdate(policyForm),
        merchantKeyInput || undefined,
      );
      setPolicy(updatedPolicy);
      setPolicyForm(toPolicyFormState(updatedPolicy));
      setPolicyMessage("Policy saved. Backend validation accepted the update.");
      await refresh();
    } catch (error) {
      setPolicyMessage(
        error instanceof Error ? error.message : "Policy update failed.",
      );
    } finally {
      setSavingPolicy(false);
    }
  };

  if (loading && !summary) {
    return (
      <section className="merchant-console loading-panel">
        <p>Loading merchant intelligence...</p>
      </section>
    );
  }

  return (
    <section className="merchant-console" aria-labelledby="merchant-title">
      <aside className="merchant-sidebar" aria-label="Merchant console sections">
        <div>
          <p className="eyebrow">Merchant Console</p>
          <h1 id="merchant-title">TechNova Intelligence</h1>
          <span className="mode-pill">Razorpay Test Mode</span>
        </div>
        <nav>
          {(Object.keys(sectionLabels) as DashboardSection[]).map((section) => (
            <button
              key={section}
              type="button"
              className={activeSection === section ? "active" : ""}
              onClick={() => setActiveSection(section)}
            >
              {sectionLabels[section]}
            </button>
          ))}
        </nav>
        <button type="button" className="secondary-action" onClick={() => void refresh()}>
          Refresh
        </button>
      </aside>

      <div className="merchant-workspace">
        {errorMessage && (
          <div className="notice error" role="alert">
            {errorMessage}
          </div>
        )}

        {summary && (
          <>
            <section className="kpi-grid" aria-label="Merchant KPIs">
              <article>
                <span>AI-assisted Revenue - Test Mode</span>
                <strong>{formatPaiseAsInr(summary.metrics.verifiedRevenue)}</strong>
              </article>
              <article>
                <span>Verified payments</span>
                <strong>{summary.metrics.verifiedPayments}</strong>
              </article>
              <article>
                <span>Active conversations</span>
                <strong>{summary.metrics.activeConversations}</strong>
              </article>
              <article>
                <span>Policy interventions</span>
                <strong>{summary.metrics.policyInterventions}</strong>
              </article>
            </section>

            {(activeSection === "overview" || activeSection === "conversations") && (
              <section className="merchant-grid">
                <article className="merchant-card">
                  <div className="panel-heading compact">
                    <div>
                      <p className="eyebrow">Funnel</p>
                      <h2>AI commerce conversion</h2>
                    </div>
                  </div>
                  <div className="funnel-list">
                    {[
                      ["Conversations", summary.funnel.conversations],
                      ["Recommendations", summary.funnel.recommendations],
                      ["Offers", summary.funnel.offers],
                      ["Accepted offers", summary.funnel.acceptedOffers],
                      ["Verified payments", summary.funnel.verifiedPayments],
                    ].map(([label, value]) => {
                      const count = Number(value);
                      return (
                        <div key={label} className="funnel-row">
                          <div>
                            <strong>{label}</strong>
                            <span>{count} total</span>
                          </div>
                          <div className="funnel-track">
                            <span
                              style={{
                                width: `${Math.max(
                                  4,
                                  Math.min(
                                    100,
                                    summary.funnel.conversations
                                      ? (count / summary.funnel.conversations) * 100
                                      : 0,
                                  ),
                                )}%`,
                              }}
                            />
                          </div>
                          <em>{conversionRate(count, summary.funnel.conversations)}</em>
                        </div>
                      );
                    })}
                  </div>
                </article>

                <article className="merchant-card">
                  <div className="panel-heading compact">
                    <div>
                      <p className="eyebrow">Recent journeys</p>
                      <h2>Live conversations</h2>
                    </div>
                  </div>
                  <div className="conversation-list">
                    {summary.recentConversations.length === 0 ? (
                      <p className="empty-copy">No recent conversations yet.</p>
                    ) : (
                      summary.recentConversations.map((conversation) => (
                        <button
                          key={conversation.id}
                          type="button"
                          className={
                            selectedConversation?.id === conversation.id ? "selected" : ""
                          }
                          onClick={() => setSelectedConversation(conversation)}
                        >
                          <strong>{conversation.customerNeed ?? "Conversation started"}</strong>
                          <span>
                            {conversation.context.category ?? "Unknown category"} /{" "}
                            {stateLabels[conversation.context.customerState ?? "unknown"]}
                          </span>
                          <small>{formatDate(conversation.lastActivity)}</small>
                        </button>
                      ))
                    )}
                  </div>
                </article>
              </section>
            )}

            {(activeSection === "overview" || activeSection === "policy") && policy && policyForm && (
              <section className="merchant-grid">
                <article className="merchant-card">
                  <div className="panel-heading compact">
                    <div>
                      <p className="eyebrow">Policy impact</p>
                      <h2>Merchant guardrails</h2>
                    </div>
                  </div>
                  <dl className="policy-readout">
                    <div><dt>Maximum discount</dt><dd>{policy.maxDiscountPercent}%</dd></div>
                    <div><dt>Approval threshold</dt><dd>{policy.approvalThresholdPercent}%</dd></div>
                    <div><dt>Maximum offers per conversation</dt><dd>{policy.maximumOffersPerConversation}</dd></div>
                    <div><dt>Offer expiry</dt><dd>{policy.offerExpiryMinutes} min</dd></div>
                    <div><dt>Discounts</dt><dd>{policy.allowDiscounts ? "Enabled" : "Disabled"}</dd></div>
                    <div><dt>Checkout</dt><dd>{policy.allowCheckout ? "Enabled" : "Disabled"}</dd></div>
                  </dl>
                </article>

                <article className="merchant-card">
                  <div className="panel-heading compact">
                    <div>
                      <p className="eyebrow">Controls</p>
                      <h2>Update safe policy fields</h2>
                    </div>
                  </div>
                  <form className="policy-form" onSubmit={handlePolicySave}>
                    <label>
                      Maximum discount
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={policyForm.maxDiscountPercent}
                        onChange={(event) =>
                          setPolicyForm({ ...policyForm, maxDiscountPercent: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Approval threshold
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={policyForm.approvalThresholdPercent}
                        onChange={(event) =>
                          setPolicyForm({ ...policyForm, approvalThresholdPercent: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Minimum order amount
                      <input
                        type="number"
                        min="0"
                        value={policyForm.minimumOrderAmount}
                        onChange={(event) =>
                          setPolicyForm({ ...policyForm, minimumOrderAmount: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Max offers per conversation
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={policyForm.maximumOffersPerConversation}
                        onChange={(event) =>
                          setPolicyForm({ ...policyForm, maximumOffersPerConversation: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Offer expiry minutes
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={policyForm.offerExpiryMinutes}
                        onChange={(event) =>
                          setPolicyForm({ ...policyForm, offerExpiryMinutes: event.target.value })
                        }
                      />
                    </label>
                    {[
                      ["allowDiscounts", "Discounts"],
                      ["allowBundles", "Bundles"],
                      ["allowAlternativeProducts", "Alternatives"],
                      ["allowCheckout", "Checkout"],
                    ].map(([field, label]) => (
                      <label key={field} className="toggle-row">
                        <input
                          type="checkbox"
                          checked={Boolean(policyForm[field as keyof PolicyFormState])}
                          onChange={(event) =>
                            setPolicyForm({
                              ...policyForm,
                              [field]: event.target.checked,
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                    <p>
                      RevenuePilot can propose discounts, but these values decide
                      what the merchant policy can approve or constrain.
                    </p>
                    <label>
                      Merchant admin key (Buildathon demo only — not stored, not
                      part of the customer app)
                      <input
                        type="password"
                        autoComplete="off"
                        placeholder="x-merchant-key"
                        value={merchantKeyInput}
                        onChange={(event) => setMerchantKeyInput(event.target.value)}
                      />
                    </label>
                    <p className="hint">
                      This key is required by the backend to save policy changes.
                      It is held only in this browser tab's memory for this
                      session and is never bundled into the app or written to
                      storage — see MERCHANT_ADMIN_KEY in backend/.env.example.
                    </p>
                    {policyMessage && <div className="notice info">{policyMessage}</div>}
                    <button type="submit" disabled={savingPolicy}>
                      {savingPolicy ? "Saving..." : "Save policy"}
                    </button>
                  </form>
                </article>
              </section>
            )}

            {(activeSection === "overview" || activeSection === "audit") && (
              <section className="merchant-grid">
                <article className="merchant-card">
                  <div className="panel-heading compact">
                    <div>
                      <p className="eyebrow">Journey detail</p>
                      <h2>{selectedConversation ? shortId(selectedConversation.id) : "No conversation selected"}</h2>
                    </div>
                  </div>
                  {selectedConversation ? (
                    <dl className="journey-readout">
                      <div><dt>Need</dt><dd>{selectedConversation.customerNeed ?? "Not captured yet"}</dd></div>
                      <div><dt>Intent</dt><dd>{selectedConversation.context.intent ?? "Unknown"}</dd></div>
                      <div><dt>Category</dt><dd>{selectedConversation.context.category ?? "Unknown"}</dd></div>
                      <div><dt>Budget</dt><dd>{selectedConversation.context.budget ? formatPaiseAsInr(selectedConversation.context.budget * 100) : "Not set"}</dd></div>
                      <div><dt>Customer signal</dt><dd>{stateLabels[selectedConversation.context.customerState ?? "unknown"]}</dd></div>
                    </dl>
                  ) : (
                    <p className="empty-copy">No conversation selected.</p>
                  )}
                  {policyStory && <div className="policy-story">{policyStory}</div>}
                </article>

                <article className="merchant-card">
                  <div className="panel-heading compact">
                    <div>
                      <p className="eyebrow">Audit trail</p>
                      <h2>Explainable timeline</h2>
                    </div>
                  </div>
                  <div className="audit-timeline">
                    {(conversationAudit.length > 0 ? conversationAudit : summary.recentAuditEvents).length === 0 ? (
                      <p className="empty-copy">No audit events yet.</p>
                    ) : (
                      (conversationAudit.length > 0 ? conversationAudit : summary.recentAuditEvents).map((event, index) => (
                        <article key={`${event.eventType}-${event.createdAt ?? index}`}>
                          <span className="actor-badge">{actorIcons[event.actor] ?? "E"}</span>
                          <div>
                            <strong>{eventLabels[event.eventType]}</strong>
                            <small>{event.eventType} / {event.actor}</small>
                            <p>{event.reason ?? event.summary}</p>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </article>
              </section>
            )}

            {(activeSection === "overview" || activeSection === "offers") && (
              <article className="merchant-card">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Offers</p>
                    <h2>Policy-controlled incentives</h2>
                  </div>
                </div>
                <div className="data-list">
                  {summary.recentOffers.length === 0 ? (
                    <p className="empty-copy">No active offers.</p>
                  ) : (
                    summary.recentOffers.map((offer) => (
                      <div key={offer.id}>
                        <strong>{shortId(offer.productId)}</strong>
                        <span>
                          {offer.requestedDiscountPercent}% requested to{" "}
                          {offer.approvedDiscountPercent}% approved
                        </span>
                        <span>{offer.policyDecision} / {offer.status}</span>
                        <span>{formatPaiseAsInr(offer.finalAmount)}</span>
                      </div>
                    ))
                  )}
                </div>
              </article>
            )}

            {(activeSection === "overview" || activeSection === "payments") && (
              <article className="merchant-card">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Payments</p>
                    <h2>Backend-verified checkout</h2>
                  </div>
                  <span className="status-chip success">
                    {summary.metrics.verifiedPayments} / {summary.recentPayments.length} verified
                  </span>
                </div>
                <div className="data-list">
                  {summary.recentPayments.length === 0 ? (
                    <p className="empty-copy">No verified payments yet.</p>
                  ) : (
                    summary.recentPayments.map((payment) => (
                      <div key={payment.id}>
                        <strong>{shortId(payment.id)}</strong>
                        <span>{formatPaiseAsInr(payment.amount)}</span>
                        <span>{payment.status}</span>
                        <span>{payment.razorpayOrderId}</span>
                      </div>
                    ))
                  )}
                </div>
              </article>
            )}

            {activeSection === "overview" && (
              <section className="merchant-grid">
                <article className="merchant-card">
                  <div className="panel-heading compact">
                    <div>
                      <p className="eyebrow">Recommendations</p>
                      <h2>Top recommended products</h2>
                    </div>
                  </div>
                  <div className="data-list compact-list">
                    {summary.topRecommendedProducts.length === 0 ? (
                      <p className="empty-copy">No product recommendations yet.</p>
                    ) : (
                      summary.topRecommendedProducts.map((product) => (
                        <div key={product.name}>
                          <strong>{product.name}</strong>
                          <span>{product.count} recommendations</span>
                        </div>
                      ))
                    )}
                  </div>
                </article>
                <article className="merchant-card">
                  <div className="panel-heading compact">
                    <div>
                      <p className="eyebrow">Customer states</p>
                      <h2>Current journey posture</h2>
                    </div>
                  </div>
                  <div className="data-list compact-list">
                    {summary.customerStates.length === 0 ? (
                      <p className="empty-copy">No customer state data yet.</p>
                    ) : (
                      summary.customerStates.map((state) => (
                        <div key={state.state}>
                          <strong>{stateLabels[state.state] ?? state.state}</strong>
                          <span>{state.count} conversations</span>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              </section>
            )}
          </>
        )}
      </div>
    </section>
  );
};
