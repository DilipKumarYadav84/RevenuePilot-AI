import { useMemo, useState } from "react";

import { ChatPanel } from "../chat/ChatPanel";
import { DecisionPath } from "../common/DecisionPath";
import { OfferCard } from "../offers/OfferCard";
import { PaymentStatus } from "../payment/PaymentStatus";
import { ProductDetails } from "../products/ProductDetails";
import { RecommendationCard } from "../products/RecommendationCard";
import { useRazorpayCheckout } from "../../hooks/useRazorpayCheckout";
import {
  appendConversationMessage,
  createConversation,
  processConversation,
} from "../../services/conversation.service";
import { acceptOffer, createOffer } from "../../services/offer.service";
import type {
  CatalogResult,
  ConversationMessage,
  ExtractedConversationContext,
  JourneyStepState,
  PolicyDecision,
} from "../../types/conversation";
import type { Offer } from "../../types/payment";
import { formatPaiseAsInr } from "../../utils/money";

const stateLabels: Record<string, string> = {
  browsing: "Browsing",
  comparing: "Comparing options",
  hesitating: "Considering value",
  ready_to_buy: "Ready to buy",
  unknown: "Learning",
};

const getProductName = (
  selectedProduct: CatalogResult | null,
  offer: Offer | null,
): string => selectedProduct?.name ?? (offer ? "TechNova product" : "TechNova recommendation");

const getApprovedDiscount = (policyDecision: PolicyDecision): number | null => {
  if (
    policyDecision.decision !== "APPROVED" &&
    policyDecision.decision !== "MODIFIED"
  ) {
    return null;
  }

  return policyDecision.approvedAction?.approvedDiscountPercent ?? null;
};

const isDiscountDecisionOfferable = (policyDecision: PolicyDecision): boolean =>
  getApprovedDiscount(policyDecision) !== null;

export const CustomerExperience = () => {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState<ExtractedConversationContext | null>(null);
  const [catalogResults, setCatalogResults] = useState<CatalogResult[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [acceptedOffer, setAcceptedOffer] = useState<Offer | null>(null);
  const [policyDecision, setPolicyDecision] = useState<PolicyDecision | null>(null);
  const [processing, setProcessing] = useState(false);
  const [creatingOffer, setCreatingOffer] = useState(false);
  const [acceptingOffer, setAcceptingOffer] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const checkout = useRazorpayCheckout();

  const selectedProduct =
    catalogResults.find((product) => product.productId === selectedProductId) ??
    catalogResults[0] ??
    null;
  const productName = getProductName(selectedProduct, offer);

  const journeyStates = useMemo<Record<string, JourneyStepState>>(
    () => ({
      need: context?.category || context?.budget ? "done" : processing ? "active" : "idle",
      product: catalogResults.length > 0 ? "done" : processing ? "active" : "idle",
      offer: offer ? "done" : creatingOffer ? "active" : "idle",
      policy: policyDecision
        ? policyDecision.decision === "BLOCKED"
          ? "blocked"
          : "done"
        : "idle",
      payment:
        checkout.state === "verified"
          ? "done"
          : checkout.state === "failed"
            ? "blocked"
            : "idle",
    }),
    [catalogResults.length, checkout.state, context, creatingOffer, offer, policyDecision, processing],
  );

  const resetJourney = () => {
    setConversationId(null);
    setMessages([]);
    setDraft("");
    setContext(null);
    setCatalogResults([]);
    setSelectedProductId(null);
    setOffer(null);
    setAcceptedOffer(null);
    setPolicyDecision(null);
    setErrorMessage(null);
    checkout.reset();
  };

  const ensureConversation = async (): Promise<string> => {
    if (conversationId) {
      return conversationId;
    }

    const conversation = await createConversation();
    const id = conversation._id;

    if (!id) {
      throw new Error("RevenuePilot could not start a conversation.");
    }

    setConversationId(id);
    return id;
  };

  const maybeCreateOffer = async (
    nextConversationId: string,
    resultProduct: CatalogResult | null,
    decision: PolicyDecision,
  ) => {
    const action = decision.requestedAction;

    if (
      action.action !== "CREATE_DISCOUNT" ||
      !action.productId ||
      action.requestedDiscountPercent === undefined ||
      !isDiscountDecisionOfferable(decision)
    ) {
      return;
    }

    setCreatingOffer(true);
    try {
      const result = await createOffer({
        conversationId: nextConversationId,
        productId: action.productId,
        requestedDiscountPercent: action.requestedDiscountPercent,
        idempotencyKey: `ui_offer_${nextConversationId}_${action.productId}`,
      });

      if (!result.offer) {
        throw new Error("TechNova could not create this offer right now.");
      }

      setOffer(result.offer);
      setAcceptedOffer(result.offer.status === "accepted" ? result.offer : null);

      if (resultProduct) {
        setSelectedProductId(resultProduct.productId);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Offer creation failed. Please try again.",
      );
    } finally {
      setCreatingOffer(false);
    }
  };

  const sendMessage = async (messageOverride?: string) => {
    const content = (messageOverride ?? draft).trim();

    if (!content || processing) {
      return;
    }

    setProcessing(true);
    setErrorMessage(null);
    setDraft("");
    setMessages((current) => [...current, { role: "customer", content }]);

    try {
      const id = await ensureConversation();
      await appendConversationMessage(id, { role: "customer", content });
      const result = await processConversation(id);
      const assistantMessage: ConversationMessage = {
        role: "assistant",
        content: result.assistantMessage.content,
      };

      setMessages((current) => [...current, assistantMessage]);
      setContext(result.extractedContext);
      setCatalogResults(result.catalogResults);
      setPolicyDecision(result.policyDecision);

      const nextSelected =
        result.catalogResults.find(
          (product) => product.productId === result.proposedAction.productId,
        ) ??
        result.catalogResults[0] ??
        null;

      if (nextSelected) {
        setSelectedProductId(nextSelected.productId);
      }

      await maybeCreateOffer(id, nextSelected, result.policyDecision);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "RevenuePilot could not complete this step. Please retry.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleAcceptOffer = async () => {
    if (!offer?._id || acceptingOffer) {
      setErrorMessage("This offer is not ready to accept yet.");
      return;
    }

    setAcceptingOffer(true);
    setErrorMessage(null);

    try {
      const result = await acceptOffer(offer._id);
      setOffer(result.offer);
      setAcceptedOffer(result.offer);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Offer acceptance failed. Please retry.",
      );
    } finally {
      setAcceptingOffer(false);
    }
  };

  const handlePayment = async () => {
    if (!acceptedOffer?._id) {
      setErrorMessage("Accept the offer before starting checkout.");
      return;
    }

    await checkout.startCheckout({
      offerId: acceptedOffer._id,
      productName,
    });
  };

  return (
    <>
      <section id="top" className="hero-section">
        <div className="hero-copy">
          <span className="mode-pill">Razorpay Buildathon - Test Mode</span>
          <h1>AI that turns buying intent into revenue.</h1>
          <p>
            RevenuePilot guides shoppers through catalog discovery, merchant-safe
            incentives, and verified Razorpay checkout.
          </p>
          <a href="#commerce-workspace" className="hero-cta">
            Start shopping with AI
          </a>
        </div>
        <DecisionPath states={journeyStates} />
      </section>

      <section
        id="commerce-workspace"
        className="commerce-workspace"
        aria-label="AI commerce workspace"
      >
        <ChatPanel
          messages={messages}
          draft={draft}
          processing={processing}
          onDraftChange={setDraft}
          onSend={(message) => {
            void sendMessage(message);
          }}
        />

        <aside className="context-panel" aria-label="Recommendations and checkout">
          <section className="context-card understanding-card">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Understanding your needs</p>
                <h2>{stateLabels[context?.customerState ?? "unknown"]}</h2>
              </div>
            </div>
            <dl className="insight-grid">
              <div>
                <dt>Category</dt>
                <dd>{context?.category ?? "Listening"}</dd>
              </div>
              <div>
                <dt>Budget</dt>
                <dd>{context?.budget ? formatPaiseAsInr(context.budget * 100) : "Not set"}</dd>
              </div>
              <div>
                <dt>Use case</dt>
                <dd>{context?.useCases?.[0] ?? "Learning"}</dd>
              </div>
            </dl>
          </section>

          {catalogResults.length > 0 && (
            <section className="context-card recommendations-panel">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">Catalog-backed picks</p>
                  <h2>Recommendations</h2>
                </div>
              </div>
              <div className="recommendation-list">
                {catalogResults.map((product, index) => (
                  <RecommendationCard
                    key={product.productId}
                    product={product}
                    rank={index}
                    selected={product.productId === selectedProduct?.productId}
                    onSelect={() => setSelectedProductId(product.productId)}
                  />
                ))}
              </div>
            </section>
          )}

          <ProductDetails product={selectedProduct} />

          {policyDecision?.decision === "MODIFIED" && offer && (
            <div className="notice info">
              TechNova can offer you {offer.approvedDiscountPercent}% off this product.
            </div>
          )}

          {errorMessage && (
            <div className="notice error" role="alert">
              {errorMessage}
            </div>
          )}

          {checkout.errorMessage && (
            <div className="notice error" role="alert">
              {checkout.errorMessage}
            </div>
          )}

          <OfferCard
            offer={offer}
            accepting={acceptingOffer}
            accepted={Boolean(acceptedOffer)}
            onAccept={handleAcceptOffer}
          />

          {acceptedOffer && checkout.state !== "verified" && (
            <button
              type="button"
              className="checkout-button"
              disabled={
                checkout.state === "loading_order" ||
                checkout.state === "checkout_open" ||
                checkout.state === "verifying"
              }
              onClick={() => {
                void handlePayment();
              }}
            >
              {checkout.state === "loading_order"
                ? "Preparing secure checkout..."
                : checkout.state === "checkout_open"
                  ? "Waiting for payment..."
                  : checkout.state === "verifying"
                    ? "Verifying payment..."
                    : "Pay securely with Razorpay"}
            </button>
          )}

          <PaymentStatus
            state={checkout.state}
            payment={checkout.verifiedPayment}
            productName={productName}
          />

          {checkout.state === "verified" && (
            <button type="button" className="secondary-action" onClick={resetJourney}>
              Start another recommendation
            </button>
          )}
        </aside>
      </section>
    </>
  );
};
