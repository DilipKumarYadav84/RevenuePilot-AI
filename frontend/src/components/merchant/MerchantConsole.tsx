import { type FormEvent, useEffect, useCallback, useState } from "react";

import { getConversationAudit } from "../../services/audit.service";
import { getDashboardSummary } from "../../services/dashboard.service";
import { getPolicy, updatePolicy } from "../../services/policy.service";
import { AuditTimeline } from "../common/AuditTimeline";
import type { AuditEvent } from "../../types/audit";
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
  conversations: "Live conversations",
  offers: "Offers",
  payments: "Razorpay payments",
  policy: "Policy",
  audit: "Audit trail",
};

const stateLabels: Record<string, string> = {
  browsing: "Exploring options",
  comparing: "Comparing options",
  hesitating: "Considering value",
  ready_to_buy: "Ready to purchase",
  unknown: "Not set",
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

const previewText = (value: string | null, maxLength = 96): string => {
  if (!value) {
    return "Conversation started";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
};

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

export const MerchantConsole = () => {
  const [activeSection, setActiveSection] = useState<DashboardSection>("overview");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [policy, setPolicy] = useState<MerchantPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState<PolicyFormState | null>(null);
  const [selectedConversation, setSelectedConversation] =
    useState<DashboardConversationSummary | null>(null);
  const [auditResult, setAuditResult] = useState<{ id: string; events: AuditEvent[]; error: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);
  const [merchantKeyInput, setMerchantKeyInput] = useState("");

  const refresh = useCallback(() => Promise.all([getDashboardSummary(), getPolicy()])
    .then(([nextSummary, nextPolicy]) => {
      setErrorMessage(null);
      setSummary(nextSummary);
      setPolicy(nextPolicy);
      setPolicyForm(toPolicyFormState(nextPolicy));
      setSelectedConversation(current => current
        ? nextSummary.recentConversations.find(item => item.id === current.id) ?? current
        : nextSummary.recentConversations[0] ?? null);
    })
    .catch(() => setErrorMessage("Merchant dashboard could not be loaded. Refresh to retry."))
    .finally(() => setLoading(false)), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }

    let active = true;
    getConversationAudit(selectedConversation.id)
      .then((events) => {
        if (active) {
          setAuditResult({ id: selectedConversation.id, events, error: false });
        }
      })
      .catch(() => {
        if (active) setAuditResult({ id: selectedConversation.id, events: [], error: true });
      });

    return () => {
      active = false;
    };
  }, [selectedConversation]);

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
      setPolicyMessage("Merchant policy saved. New decisions will use these rules.");
      await refresh();
    } catch {
      setPolicyMessage(
        "Policy update failed.",
      );
    } finally {
      setSavingPolicy(false);
    }
  };

  if (loading && !summary) {
    return (
      <section className="merchant-console loading-panel" role="status">
        <p>Loading merchant intelligence...</p>
      </section>
    );
  }

  return (
    <section
      className="merchant-console"
      aria-labelledby="merchant-title"
    >
      <aside className="merchant-sidebar" aria-label="Merchant console sections">
        <div className="merchant-brand-card">
          <div className="merchant-badge-row">
            <span className="mode-pill-accent">Merchant workspace</span>
            <span className="mode-pill">Test Mode</span>
          </div>
          <p className="eyebrow">Merchant Control Tower</p>
          <h1 id="merchant-title">Merchant Console</h1>
        </div>
        <nav>
          {(Object.keys(sectionLabels) as DashboardSection[]).map((section) => (
            <button
              key={section}
              type="button"
              className={activeSection === section ? "active" : ""}
              aria-current={activeSection === section ? "page" : undefined}
              onClick={() => setActiveSection(section)}
            >
              {sectionLabels[section]}
            </button>
          ))}
        </nav>
        <button type="button" className="secondary-action refresh-btn" disabled={loading} onClick={() => { setLoading(true); void refresh(); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {loading ? "Refreshing..." : "Refresh data"}
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
              <article className="kpi-card revenue">
                <span className="kpi-label">Verified Test Revenue</span>
                <strong>{formatPaiseAsInr(summary.metrics.verifiedRevenue)}</strong>
                <span className="kpi-subtitle">Server verified</span>
              </article>
              <article className="kpi-card">
                <span className="kpi-label">Active Conversations</span>
                <strong>{summary.metrics.activeConversations}</strong>
                <span className="kpi-subtitle">Active in the last 24 hours</span>
              </article>
              <article className="kpi-card">
                <span className="kpi-label">Offers Created</span>
                <strong>{summary.metrics.offersCreated}</strong>
                <span className="kpi-subtitle">Discount offer records</span>
              </article>
              <article className="kpi-card">
                <span className="kpi-label">Policy Interventions</span>
                <strong>{summary.metrics.policyInterventions}</strong>
                <span className="kpi-subtitle">Capped, blocked or held events</span>
              </article>
              <article className="kpi-card">
                <span className="kpi-label">Verified Payments</span>
                <strong>{summary.metrics.verifiedPayments}</strong>
                <span className="kpi-subtitle">Server verified</span>
              </article>
            </section>

            {(activeSection === "overview" || activeSection === "conversations") && (
              <section className="merchant-grid">
                <article className="merchant-card">
                  <div className="panel-heading compact">
                    <div>
                      <p className="eyebrow">Journey milestones</p>
                      <h2>AI Commerce Conversion</h2>
                    </div>
                  </div>
                  <p className="hint">Unique conversations at each stage, across all journeys. Checkout includes full-price purchases.</p>
                  <div className="funnel-list">
                    {[
                      ["Conversations", summary.funnel.conversations],
                      ["Recommended", summary.funnel.recommendations],
                      ["Offer created", summary.funnel.offers],
                      ["Offer accepted", summary.funnel.acceptedOffers],
                      ["Payment verified", summary.funnel.verifiedPayments],
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
                                  0,
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
                  <p className="hint">Stages are independent milestones. Direct purchases can skip incentives; older test records may have missing earlier stages.</p>
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
                      <p className="empty-copy">Start a shopper journey to see recommendations.</p>
                    ) : (
                      summary.recentConversations.map((conversation) => (
                        <button
                          key={conversation.id}
                          type="button"
                          className={
                            selectedConversation?.id === conversation.id ? "selected" : ""
                          }
                          aria-pressed={selectedConversation?.id === conversation.id}
                          onClick={() => { setSelectedConversation(conversation); setActiveSection("audit"); }}
                        >
                          <strong>{previewText(conversation.customerNeed)}</strong>
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

            {activeSection === "policy" && policy && policyForm && (
              <section className="merchant-grid">
                <article className="merchant-card">
                  <div className="panel-heading compact">
                    <div>
                      <p className="eyebrow">Controls</p>
                      <h2>Merchant guardrails</h2>
                    </div>
                  </div>
                  <form className="policy-form" onSubmit={handlePolicySave}>
                    <label>
                      Maximum discount (%)
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
                      Approval threshold (%)
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
                      Minimum order amount (₹)
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
                      Offers per conversation
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
                      Offer expiry (min)
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
                    <p className="policy-explanation">
                      RevenuePilot AI can propose commercial offers, but these exact rules deterministically govern what becomes executable.
                    </p>
                    <label>
                      Merchant admin key
                      <input
                        type="password"
                        autoComplete="off"
                        placeholder="Required to save changes"
                        value={merchantKeyInput}
                        onChange={(event) => setMerchantKeyInput(event.target.value)}
                      />
                    </label>
                    <p className="hint">
                      Required to update merchant policy. Stored only for this browser session.
                    </p>
                    {policyMessage && <div className="notice info">{policyMessage}</div>}
                    <button type="submit" disabled={savingPolicy}>
                      {savingPolicy ? "Saving..." : "Save policy"}
                    </button>
                  </form>
                </article>
              </section>
            )}

            {activeSection === "audit" && (
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

                </article>

                <article className="merchant-card">
                  <div className="panel-heading compact">
                    <div>
                      <p className="eyebrow">Audit trail</p>
                      <h2>Explainable timeline</h2>
                    </div>
                  </div>
                  <AuditTimeline events={selectedConversation ? (auditResult?.id === selectedConversation.id ? auditResult.events : []) : summary.recentAuditEvents}
                    loading={Boolean(selectedConversation && auditResult?.id !== selectedConversation.id)}
                    error={Boolean(selectedConversation && auditResult?.id === selectedConversation.id && auditResult.error)} />
                </article>
              </section>
            )}

            {activeSection === "offers" && (
              <article className="merchant-card">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Offers</p>
                    <h2>Policy-Controlled Incentives</h2>
                  </div>
                </div>
                <div className="data-list">
                  {summary.recentOffers.length === 0 ? (
                    <p className="empty-copy">Merchant-approved incentives will appear here.</p>
                  ) : (
                    summary.recentOffers.map((offer) => (
                      <div key={offer.id} className="offer-row-item">
                        <div>
                          <strong>{shortId(offer.productId)}</strong>
                          <span className="offer-discount-tag">
                            {offer.requestedDiscountPercent}% req → {offer.approvedDiscountPercent}% app
                          </span>
                        </div>
                        <span className={`status-chip ${offer.policyDecision.toLowerCase()}`}>
                          {offer.policyDecision} / {offer.status}
                        </span>
                        <strong className="offer-price-val">{formatPaiseAsInr(offer.finalAmount)}</strong>
                      </div>
                    ))
                  )}
                </div>
              </article>
            )}

            {activeSection === "payments" && (
              <article className="merchant-card">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Payments</p>
                    <h2>Razorpay payment ledger</h2>
                  </div>
                  <span className="status-chip success">
                    {summary.recentPayments.filter(payment => payment.status === "verified").length} of {summary.recentPayments.length} shown verified
                  </span>
                </div>
                <div className="crypto-verification-banner">
                  <div className="crypto-banner-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div>
                    <strong>Server-Side Verification Active</strong>
                    <p>Only payments marked verified have passed server verification. Pending and failed attempts are shown with their actual status.</p>
                  </div>
                </div>
                <div className="data-list">
                  {summary.recentPayments.length === 0 ? (
                    <p className="empty-copy">Verified Razorpay Test Mode payments will appear here.</p>
                  ) : (
                    summary.recentPayments.map((payment) => (
                      <div key={payment.id} className="payment-row-item">
                        <div>
                          <strong>{shortId(payment.id)}</strong>
                          <span className="payment-order-id">{payment.razorpayOrderId}</span>
                        </div>
                        <span className={`status-chip ${payment.status === "verified" ? "success" : payment.status === "verification_failed" ? "danger" : "waiting"}`}>{payment.status.toUpperCase()}</span>
                        <strong className="payment-amount-val">{formatPaiseAsInr(payment.amount)}</strong>
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
                      <h2>Frequently recommended</h2>
                    </div>
                  </div>
                  <div className="data-list compact-list">
                    {summary.topRecommendedProducts.length === 0 ? (
                      <p className="empty-copy">No product recommendations yet.</p>
                    ) : (
                      summary.topRecommendedProducts.map((product) => (
                        <div key={product.name}>
                          <strong>{product.name}</strong>
                          <span>{product.count} events in recent sample</span>
                        </div>
                      ))
                    )}
                  </div>
                </article>
                <article className="merchant-card">
                  <div className="panel-heading compact">
                    <div>
                      <p className="eyebrow">Customer states</p>
                      <h2>Recent customer states</h2>
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
