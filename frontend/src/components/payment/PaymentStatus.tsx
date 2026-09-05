import type { PaymentState } from "../../hooks/useRazorpayCheckout";
import type { SafePaymentRecord } from "../../types/payment";
import { formatPaiseAsInr } from "../../utils/money";

const shortId = (value: string): string => `${value.slice(0, 6)}...${value.slice(-6)}`;

const statusCopy: Record<PaymentState, string> = {
  idle: "Secure checkout powered by Razorpay appears when a server-priced purchase is ready.",
  loading_order: "Preparing secure checkout...",
  checkout_open: "Waiting for payment in Razorpay Test Mode...",
  verifying: "Verifying payment with RevenuePilot server...",
  verified: "Payment verified",
  failed: "Payment failed or checkout was cancelled.",
};

const getStepState = (
  state: PaymentState,
  step: "priced" | "order" | "payment" | "verification",
): "done" | "active" | "idle" | "failed" => {
  if (state === "failed") {
    return step === "payment" || step === "verification" ? "failed" : "done";
  }

  if (step === "priced") {
    return state === "idle" ? "idle" : "done";
  }

  if (step === "order") {
    if (state === "loading_order") return "active";
    return state === "checkout_open" || state === "verifying" || state === "verified"
      ? "done"
      : "idle";
  }

  if (step === "payment") {
    if (state === "checkout_open") return "active";
    return state === "verifying" || state === "verified" ? "done" : "idle";
  }

  if (state === "verifying") return "active";
  return state === "verified" ? "done" : "idle";
};

export const PaymentStatus = ({
  state,
  payment,
  productName,
}: {
  state: PaymentState;
  payment: SafePaymentRecord | null;
  productName: string;
}) => (
  <section className={`context-card payment-card payment-${state}`} aria-live="polite">
    <div className="panel-heading compact">
      <div>
        <p className="eyebrow">Razorpay checkout</p>
        <h2>{state === "verified" ? "Payment verified" : "Secure payment"}</h2>
      </div>
      <span className="mode-pill">TEST MODE</span>
    </div>
    <p>{statusCopy[state]}</p>
    <p className="payment-trust-copy">
      Payment success is confirmed only after server-side verification.
    </p>
    {state !== "failed" && <ol className="payment-progress-list">
      {[
        ["priced", "Server-priced purchase"],
        ["order", "Razorpay order created"],
        ["payment", "Awaiting payment"],
        ["verification", "Server verification"],
      ].map(([key, label]) => {
        const stepState = getStepState(
          state,
          key as "priced" | "order" | "payment" | "verification",
        );

        return (
          <li key={key} className={stepState}>
            <span>{stepState === "done" ? "✓" : stepState === "failed" ? "!" : ""}</span>
            {label}
          </li>
        );
      })}
    </ol>}
    {payment && (
      <dl className="payment-summary">
        <div>
          <dt>Product</dt>
          <dd>{productName}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd>{formatPaiseAsInr(payment.amount)}</dd>
        </div>
        <div>
          <dt>Payment reference</dt>
          <dd>{shortId(payment.id)}</dd>
        </div>
      </dl>
    )}
  </section>
);
