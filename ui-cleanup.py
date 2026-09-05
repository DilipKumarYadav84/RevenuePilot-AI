from pathlib import Path

root = Path(__file__).parent
def read(path): return (root / path).read_text(encoding='utf-8')
def write(path, text): (root / path).write_text(text, encoding='utf-8')

p = 'frontend/src/components/customer/CustomerExperience.tsx'
s = read(p).replace('useEffect, useMemo, useRef, useState', 'useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode')
s = s.replace('import { useRazorpayCheckout }', 'import { useRazorpayCheckout, type PaymentState }')
s = s.replace('type CustomerExperienceProps = {', '''export type JourneySnapshot = {
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
  renderInspector?: (snapshot: JourneySnapshot) => ReactNode;''')
s = s.replace('  hideHero = false,', '  hideHero = false,\n  renderInspector,')
s = s.replace('  const offerAnchorRef = useRef<HTMLDivElement | null>(null);', '''  const commerceRef = useRef<HTMLElement | null>(null);
  const purchaseRef = useRef<HTMLDivElement | null>(null);
  const sendingRef = useRef(false);
  const [replaying, setReplaying] = useState(false);
  const [showAll, setShowAll] = useState(false);''')
s = s.replace('    if (!content || processing) {', '    if (!content || sendingRef.current) {')
s = s.replace('    setProcessing(true);', '    sendingRef.current = true;\n    setProcessing(true);')
s = s.replace('      setProcessing(false);', '      sendingRef.current = false;\n      setProcessing(false);')
s = s.replace('      setPolicyDecision(result.policyDecision);', '')
s = s.replace('      await maybeCreateOffer(id, nextSelected, result.policyDecision);', '      setPolicyDecision(result.policyDecision);\n      await maybeCreateOffer(id, nextSelected, result.policyDecision);')
s = s.replace('    setSelectedProductId(productId);', '''    if (processing || replaying || acceptingOffer || startingPurchase || ["loading_order", "checkout_open", "verifying"].includes(checkout.state)) return;
    setSelectedProductId(productId);''')
s = s.replace('      if (!result.offer) {', '      setPolicyDecision(result.policyDecision);\n      if (!result.offer) {')
s = s.replace('      setOffer(result.offer);', '''      if (result.offer.productId !== action.productId) throw new Error("Offer does not match the selected product.");
      setOffer(result.offer);''', 1)
start = s.index('  // Replay scenario prompts')
end = s.index('  const handleBuyNow', start)
s = s[:start] + '''  const runPrompt = useEffectEvent((prompt: string) => sendMessage(prompt));
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
    panel.scrollTo({ top: purchaseRef.current.offsetTop - panel.offsetTop,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [offerId]);

''' + s[end:]
# Never expose provider or HTTP error text to shoppers.
import re
s = re.sub(r'error instanceof Error\s*\? error.message\s*:\s*', '', s)
s = s.replace('catch (error)', 'catch')
start = s.index('  return (\n    <div className={`customer-experience-container')
s = s[:start] + '''  const locked = processing || replaying || acceptingOffer || startingPurchase ||
    ["loading_order", "checkout_open", "verifying"].includes(checkout.state);
  const snapshot: JourneySnapshot = {
    conversationId, context, selectedProduct, offer, acceptedOffer, policyDecision,
    paymentState: checkout.state,
    revision: `${messages.length}:${processing}:${offer?._id}:${acceptedOffer?._id}:${checkout.state}`,
  };

  return (
    <div className={`customer-experience-container ${hideHero ? "embedded-mode" : ""}`}>
      {!hideHero && <header className="shopper-heading" id="top">
        <div><p className="eyebrow">Shopper Journey</p><h1>Find your fit. Buy with confidence.</h1></div>
        <span className="mode-pill">Razorpay Test Mode</span>
      </header>}
      <div className={renderInspector ? "director-layout" : "shopper-layout"}>
        <section id="commerce-workspace" className="commerce-workspace" aria-label="Shopper workspace">
          <ChatPanel messages={messages} draft={draft} processing={locked}
            onDraftChange={setDraft} onSend={(message) => { if (!locked) void sendMessage(message); }} />
          <aside ref={commerceRef} className="context-panel" aria-label="Recommendations and checkout">
            {!context ? <>
              <DecisionPath states={journeyStates} />
              <section className="context-card empty-state">
                <h2>Your needs, understood</h2>
                <p>Start a conversation to see RevenuePilot's understanding of the customer.</p>
                <button type="button" className="primary-action" onClick={() => document.getElementById("customer-message")?.focus()}>Start shopping with AI</button>
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
'''
write(p,s)

write('frontend/src/components/offers/OfferCard.tsx', '''import type { PolicyDecision } from "../../types/conversation";

export const OfferCard = ({ policyDecision }: { policyDecision: PolicyDecision | null }) => {
  if (!policyDecision || !["BLOCKED", "REQUIRES_APPROVAL"].includes(policyDecision.decision)
    || policyDecision.requestedAction.action === "NO_ACTION") return null;
  return <section className={`context-card policy-notice ${policyDecision.decision.toLowerCase()}`}>
    <span className={`status-chip ${policyDecision.decision.toLowerCase()}`}>{policyDecision.decision.replaceAll("_", " ")}</span>
    <h3>{policyDecision.decision === "BLOCKED" ? "This action is blocked by merchant policy" : "This offer cannot run automatically"}</h3>
    <p>{policyDecision.reason}</p>
  </section>;
};
''')

p = 'frontend/src/components/products/RecommendationCard.tsx'
s = read(p).replace('  onSelect,', '  onSelect,\n  disabled = false,').replace('  onSelect: () => void;', '  onSelect: () => void;\n  disabled?: boolean;').replace('      aria-pressed={selected}', '      aria-pressed={selected}\n      disabled={disabled}')
s = s.replace('Relevant catalog tags match your request.', 'Matches your needs.')
write(p,s)

p = 'frontend/src/components/common/DecisionPath.tsx'
s = read(p).replace('  { key: "payment"', '  { key: "accept", label: "Customer accepts", owner: "Customer" },\n  { key: "payment"').replace('Live decision path', 'How RevenuePilot works').replace('AI proposes. Policy controls. Razorpay verifies.', 'From intent to a verified purchase')
write(p,s)

# Native dialog provides focus containment, Escape, and focus restoration.
p = 'frontend/src/components/payment/ReceiptModal.tsx'
s = 'import { Modal } from "../common/Modal";\n' + read(p)
s = s.replace(': new Date().toLocaleString("en-IN");', ': "Not available";')
s = s.replace('<div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">', '<Modal title="Verified payment receipt" onClose={onClose}>').replace('    </div>\n  );', '    </Modal>\n  );')
s = s.replace('Merchant invoice with server verification details', 'Razorpay Test Mode payment receipt').replace('"pay_test_verified"', '"Not available"').replace('"order_test_verified"', '"Not available"').replace('VERIFIED & CAPTURED', 'SERVER VERIFIED').replace('Gateway Status', 'Verification status')
s = re.sub(r'          <div className="crypto-proof-box">.*?\n          </div>', '<p className="hint">Payment confirmed by server verification. This is a test-mode receipt, not a tax invoice.</p>', s, flags=re.S)
write(p,s)

p = 'frontend/src/hooks/useRazorpayCheckout.ts'
s = read(p)
s = re.sub(r'const getFailureMessage = .*?;\n', '', s, flags=re.S)
s = s.replace('  RazorpayFailureResponse,\n', '')
s = re.sub(r'error instanceof Error\s*\? error.message\s*:\s*', '', s).replace('.catch((error: unknown) =>', '.catch(() =>').replace('catch (error)', 'catch')
s = s.replace('checkout.on("payment.failed", (response) => {\n          setErrorMessage(getFailureMessage(response));', 'checkout.on("payment.failed", () => {\n          setErrorMessage("Payment was not completed. You can retry securely.");')
write(p,s)
