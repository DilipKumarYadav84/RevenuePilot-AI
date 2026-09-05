import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";

import { ChatPanel } from "../chat/ChatPanel";
import { DecisionPath } from "../common/DecisionPath";
import { PolicyTraceModal } from "../common/PolicyTraceModal";
import { OfferCard } from "../offers/OfferCard";
import { PaymentStatus } from "../payment/PaymentStatus";
import { RazorpayTestHelper } from "../payment/RazorpayTestHelper";
import { ReceiptModal } from "../payment/ReceiptModal";
import { ProductDetails } from "../products/ProductDetails";
import { RecommendationCard } from "../products/RecommendationCard";
import { useRazorpayCheckout, type PaymentState } from "../../hooks/useRazorpayCheckout";
import {
  appendConversationMessage,
  createConversation,
  processConversation,
} from "../../services/conversation.service";
import { acceptOffer, createCheckoutOffer, createOffer } from "../../services/offer.service";
import type {
  CatalogResult,
  ConversationMessage,
  ExtractedConversationContext,
  JourneyStepState,
  PolicyDecision,
  ProcessConversationResult,
} from "../../types/conversation";
import type { Offer } from "../../types/payment";
import { formatPaiseAsInr } from "../../utils/money";

const stateLabels: Record<string, string> = {
  browsing: "Exploring options",
  comparing: "Comparing options",
  hesitating: "Considering value",
  ready_to_buy: "Ready to purchase",
  unknown: "Not set",
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

const hasProposedOffer = (policyDecision: PolicyDecision | null): boolean =>
  policyDecision?.requestedAction.action === "CREATE_DISCOUNT" &&
  policyDecision.requestedAction.requestedDiscountPercent !== undefined;

const getNextSelectedProduct = (
  catalogResults: CatalogResult[],
  proposedActionProductId?: string,
): CatalogResult | null =>
  catalogResults.find((product) => product.productId === proposedActionProductId) ??
  catalogResults[0] ??
  null;

export type JourneySnapshot = {
  conversationId: string | null;
  context: ExtractedConversationContext | null;
  selectedProduct: CatalogResult | null;
  offer: Offer | null;
  acceptedOffer: Offer | null;
  policyDecision: PolicyDecision | null;
  paymentState: PaymentState;
  revision: string;
};

type CustomerExperienceProps = {
  renderInspector?: (snapshot: JourneySnapshot) => ReactNode;
  initialPrompts?: string[];
  hideHero?: boolean;
};

export const CustomerExperience = ({
  initialPrompts,
  hideHero = false,
  renderInspector,
}: CustomerExperienceProps) => {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const replayStartedRef = useRef(false);
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
  const [startingPurchase, setStartingPurchase] = useState(false);
  const [acceptingOffer, setAcceptingOffer] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showTraceModal, setShowTraceModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const commerceRef = useRef<HTMLElement | null>(null);
  const experienceRef = useRef<HTMLDivElement | null>(null);
  const purchaseRef = useRef<HTMLDivElement | null>(null);
  const sendingRef = useRef(false);
  const [replaying, setReplaying] = useState(false);
  const [showAll, setShowAll] = useState(false);
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
      offer: hasProposedOffer(policyDecision) || offer ? "done" : creatingOffer ? "active" : "idle",
      policy: policyDecision
        ? !hasProposedOffer(policyDecision)
          ? "idle"
          : policyDecision.decision === "BLOCKED"
          ? "blocked"
          : "done"
        : "idle",
      accept: acceptedOffer ? "done" : acceptingOffer ? "active" : "idle",
      payment:
        checkout.state === "verified"
          ? "done"
          : checkout.state === "failed"
            ? "blocked"
            : checkout.state === "loading_order" ||
                checkout.state === "checkout_open" ||
                checkout.state === "verifying"
              ? "active"
            : "idle",
    }),
    [catalogResults.length, checkout.state, context, creatingOffer, offer, policyDecision, processing, acceptedOffer, acceptingOffer],
  );

  const resetJourney = () => {
    conversationIdRef.current = null;
    replayStartedRef.current = false;
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
    setShowTraceModal(false);
    setShowReceiptModal(false);
    checkout.reset();
  };

  const clearPurchaseState = () => {
    setOffer(null);
    setAcceptedOffer(null);
    setPolicyDecision(null);
    checkout.reset();
  };

  const handleSelectProduct = (productId: string) => {
    if (processing || replaying || acceptingOffer || startingPurchase || ["loading_order", "checkout_open", "verifying"].includes(checkout.state)) return;
    setSelectedProductId(productId);

    const staleOffer = offer && offer.productId !== productId;
    const staleAcceptedOffer = acceptedOffer && acceptedOffer.productId !== productId;
    const stalePayment =
      checkout.verifiedPayment && checkout.verifiedPayment.productId !== productId;
    const stalePolicy =
      policyDecision?.requestedAction.productId &&
      policyDecision.requestedAction.productId !== productId;

    if (staleOffer || staleAcceptedOffer || stalePayment || stalePolicy) {
      clearPurchaseState();
    }
  };

  const ensureConversation = async (): Promise<string> => {
    if (conversationIdRef.current) {
      return conversationIdRef.current;
    }

    if (conversationId) {
      conversationIdRef.current = conversationId;
      return conversationId;
    }

    const conversation = await createConversation();
    const id = conversation._id;

    if (!id) {
      throw new Error("RevenuePilot could not start a conversation.");
    }

    conversationIdRef.current = id;
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
      action.productId !== resultProduct?.productId ||
      action.requestedDiscountPercent === undefined ||
      !isDiscountDecisionOfferable(decision)
    ) {
      if (action.action === "CREATE_DISCOUNT" && action.productId !== resultProduct?.productId) {
        setErrorMessage("RevenuePilot could not safely match this offer to the selected product. Please retry.");
      }
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

      setPolicyDecision(result.policyDecision);
      if (!result.offer) {
        throw new Error("TechNova could not create this offer right now.");
      }

      if (result.offer.productId !== action.productId) throw new Error("Offer does not match the selected product.");
      setOffer(result.offer);
      setAcceptedOffer(result.offer.status === "accepted" ? result.offer : null);

      if (resultProduct) {
        setSelectedProductId(resultProduct.productId);
      }
    } catch {
      setErrorMessage(
        "Offer creation failed. Please try again.",
      );
    } finally {
      setCreatingOffer(false);
    }
  };

  const sendMessage = async (
    messageOverride?: string,
  ): Promise<ProcessConversationResult | null> => {
    const content = (messageOverride ?? draft).trim();

    if (!content || sendingRef.current) {
      return null;
    }

    sendingRef.current = true;
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


      const nextSelected =
        result.proposedAction.action === "CREATE_DISCOUNT" ||
        result.proposedAction.action === "START_CHECKOUT"
          ? getNextSelectedProduct(result.catalogResults, result.proposedAction.productId)
          : result.catalogResults[0] ?? null;

      // An accepted offer is a server-authorized purchase state. A later chat
      // message must not silently switch products or discard that checkout.
      if (nextSelected && !acceptedOffer) {
        setSelectedProductId(nextSelected.productId);

        const staleOffer = offer && offer.productId !== nextSelected.productId;
        const stalePayment =
          checkout.verifiedPayment &&
          checkout.verifiedPayment.productId !== nextSelected.productId;

        if (staleOffer || stalePayment) {
          clearPurchaseState();
        }
      }

      setPolicyDecision(result.policyDecision);
      if (!acceptedOffer && !offer) {
        await maybeCreateOffer(id, nextSelected, result.policyDecision);
      }
      return result;
    } catch {
      setErrorMessage(
        "RevenuePilot could not complete this step. Please retry.",
      );
      return null;
    } finally {
      sendingRef.current = false;
      setProcessing(false);
    }
  };

  const runPrompt = useEffectEvent((prompt: string) => sendMessage(prompt));
  useEffect(() => {
    const prompts = initialPrompts?.map(prompt => prompt.trim()).filter(Boolean) ?? [];
    if (!prompts.length || replayStartedRef.current) return;
    replayStartedRef.current = true;
    let cancelled = false;
    // Defer until the mount is committed; Strict Mode cleanup cancels its rehearsal.
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setReplaying(true);
      try {
        for (const prompt of prompts) {
          if (cancelled || !(await runPrompt(prompt))) break;
        }
      } finally { if (!cancelled) setReplaying(false); }
    });
    return () => { cancelled = true; replayStartedRef.current = false; };
  }, [initialPrompts]);

  const offerId = offer?._id;
  useEffect(() => {
    if (!offerId || !commerceRef.current || !purchaseRef.current) return;
    const panel = commerceRef.current;
    if (panel.scrollHeight <= panel.clientHeight) return;
    panel.scrollTo({ top: panel.scrollTop + purchaseRef.current.getBoundingClientRect().top - panel.getBoundingClientRect().top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [offerId]);

  const handleBuyNow = async () => {
    if (!selectedProduct || startingPurchase || processing) {
      setErrorMessage("Select a product before starting checkout.");
      return;
    }

    const targetProduct = selectedProduct;
    setStartingPurchase(true);
    try {
      const result = await sendMessage(`I'm ready to buy ${targetProduct.name}.`);
      const action = result?.policyDecision.requestedAction;

      if (
        !result ||
        result.policyDecision.decision !== "APPROVED" ||
        action?.action !== "START_CHECKOUT" ||
        action.productId !== targetProduct.productId
      ) {
        setErrorMessage(
          result?.policyDecision.reason ??
            "Checkout could not be safely prepared for the selected product.",
        );
        return;
      }

      const checkoutOffer = await createCheckoutOffer({
        conversationId: result.conversationId,
        productId: targetProduct.productId,
        idempotencyKey: `ui_checkout_${result.conversationId}_${targetProduct.productId}`,
      });

      setPolicyDecision(checkoutOffer.policyDecision);

      if (!checkoutOffer.offer?._id) {
        setErrorMessage(
          checkoutOffer.policyDecision.reason ??
            "Checkout was not authorized by merchant policy.",
        );
        return;
      }

      if (checkoutOffer.offer.productId !== targetProduct.productId) {
        clearPurchaseState();
        setErrorMessage("RevenuePilot could not safely match checkout to the selected product.");
        return;
      }

      setOffer(null);
      setAcceptedOffer(checkoutOffer.offer);
      await checkout.startCheckout({
        offerId: checkoutOffer.offer._id,
        productName: targetProduct.name,
      });
    } catch {
      setErrorMessage(
        "Checkout could not be prepared. Please try again.",
      );
    } finally {
      setStartingPurchase(false);
    }
  };

  const handleAcceptOffer = async () => {
    if (!offer?._id || acceptingOffer) {
      setErrorMessage("This offer is not ready to accept yet.");
      return;
    }

    if (!selectedProduct || offer.productId !== selectedProduct.productId) {
      clearPurchaseState();
      setErrorMessage("This offer no longer matches the selected product. Please request a fresh offer.");
      return;
    }

    setAcceptingOffer(true);
    setErrorMessage(null);

    try {
      const result = await acceptOffer(offer._id);

      if (result.offer.productId !== selectedProduct.productId) {
        clearPurchaseState();
        throw new Error("RevenuePilot could not safely match this accepted offer to the selected product.");
      }

      setOffer(result.offer);
      setAcceptedOffer(result.offer);
    } catch {
      setErrorMessage(
        "Offer acceptance failed. Please retry.",
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

    if (!selectedProduct || acceptedOffer.productId !== selectedProduct.productId) {
      clearPurchaseState();
      setErrorMessage("This checkout no longer matches the selected product. Please request a fresh offer.");
      return;
    }

    await checkout.startCheckout({
      offerId: acceptedOffer._id,
      productName,
    });
  };

  const locked = processing || replaying || acceptingOffer || startingPurchase ||
    ["loading_order", "checkout_open", "verifying"].includes(checkout.state);
  const snapshot: JourneySnapshot = {
    conversationId, context, selectedProduct, offer, acceptedOffer, policyDecision,
    paymentState: checkout.state,
    revision: `${messages.length}:${processing}:${offer?._id}:${acceptedOffer?._id}:${checkout.state}`,
  };

  return (
    <div ref={experienceRef} className={`customer-experience-container ${hideHero ? "embedded-mode" : ""}`}>
      {!hideHero && <header className="shopper-heading" id="top">
        <div><p className="eyebrow">Shopper Journey</p><h1>Find your fit. Buy with confidence.</h1></div>
        <span className="mode-pill">Razorpay Test Mode</span>
      </header>}
      <div className={renderInspector ? "director-layout" : "shopper-layout"}>
        <section id="commerce-workspace" className="commerce-workspace" aria-label="Shopper workspace">
          <ChatPanel messages={messages} draft={draft} processing={processing || replaying} disabled={locked}
            onDraftChange={setDraft} onSend={(message) => { if (!locked) void sendMessage(message); }} />
          <aside ref={commerceRef} className="context-panel" aria-label="Recommendations and checkout">
            {!context ? <>
              {!hideHero && <DecisionPath states={journeyStates} />}
              <section className="context-card empty-state">
                <h2>Your needs, understood</h2>
                <p>Start a conversation to see RevenuePilot's understanding of the customer.</p>
                <button type="button" className="primary-action" onClick={() => experienceRef.current?.querySelector("textarea")?.focus()}>Start shopping with AI</button>
              </section>
            </> : <section className="context-card understanding-card">
              <div className="panel-heading compact">
                <div><p className="eyebrow">Understanding your needs</p><h2>{stateLabels[context.customerState ?? "unknown"]}</h2></div>
                {policyDecision && !processing && <button type="button" className="secondary-action" onClick={() => setShowTraceModal(true)}>Policy trace</button>}
              </div>
              <dl className="insight-grid">
                <div><dt>Category</dt><dd>{context.category ?? "Still exploring"}</dd></div>
                <div><dt>Budget</dt><dd>{context.budget ? formatPaiseAsInr(context.budget * 100) : "Flexible"}</dd></div>
                <div><dt>Price sensitivity</dt><dd>{context.priceSensitivity ?? "Not yet known"}</dd></div>
                <div><dt>Primary use case</dt><dd>{context.useCases?.[0] ?? "Still exploring"}</dd></div>
              </dl>
            </section>}
            {catalogResults.length > 0 && <section className="context-card recommendations-panel">
              <div className="panel-heading compact"><div><p className="eyebrow">Catalog-backed picks</p><h2>Recommendations</h2></div><span className="mode-pill">{catalogResults.length} matches</span></div>
              <div className="recommendation-list">
                {(showAll ? catalogResults : catalogResults.slice(0, 3)).map((product, index) => <RecommendationCard
                  key={product.productId} product={product} rank={index} selected={product.productId === selectedProduct?.productId}
                  disabled={locked} onSelect={() => handleSelectProduct(product.productId)} />)}
              </div>
              {catalogResults.length > 3 && <button type="button" className="text-button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show top 3" : `View all ${catalogResults.length}`}</button>}
            </section>}
            {context && !catalogResults.length && !processing && <p className="empty-copy">No matching products yet. Try a different budget or category.</p>}
            <div ref={purchaseRef} className="purchase-anchor">
              <ProductDetails product={selectedProduct} offer={offer} acceptedOffer={acceptedOffer} paymentState={checkout.state}
                preparingCheckout={creatingOffer || startingPurchase} actionLocked={locked} acceptingOffer={acceptingOffer}
                onBuyNow={() => void handleBuyNow()} onAcceptOffer={() => void handleAcceptOffer()} onPay={() => void handlePayment()} />
            </div>
            {creatingOffer && <p role="status">Preparing your merchant-approved offer...</p>}
            <OfferCard policyDecision={policyDecision} />
            {errorMessage && <div className="notice error" role="alert">{errorMessage}</div>}
            {checkout.errorMessage && <div className="notice error" role="alert">{checkout.errorMessage}</div>}
            {checkout.state !== "idle" && <PaymentStatus state={checkout.state} payment={checkout.verifiedPayment} productName={productName} />}
            {selectedProduct && <RazorpayTestHelper />}
            {checkout.state === "verified" && <div className="verified-success-actions">
              {checkout.verifiedPayment && <button type="button" className="primary-action" onClick={() => setShowReceiptModal(true)}>View verified receipt</button>}
              <button type="button" className="secondary-action" onClick={resetJourney}>Start another recommendation</button>
            </div>}
          </aside>
        </section>
        {renderInspector?.(snapshot)}
      </div>
      {showTraceModal && <PolicyTraceModal policyDecision={policyDecision} selectedProduct={selectedProduct} offer={offer} onClose={() => setShowTraceModal(false)} />}
      {showReceiptModal && checkout.verifiedPayment && <ReceiptModal payment={checkout.verifiedPayment} productName={productName} onClose={() => setShowReceiptModal(false)} />}
    </div>
  );
};
