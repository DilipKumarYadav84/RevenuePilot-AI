import type { PaymentState } from "../../hooks/useRazorpayCheckout";
import type { SafePaymentRecord } from "../../types/payment";
import { formatPaiseAsInr } from "../../utils/money";

const shortId = (value: string): string => `${value.slice(0, 6)}...${value.slice(-6)}`;

const statusCopy: Record<PaymentState, string> = {
  idle: "Secure checkout will appear after offer acceptance.",
  loading_order: "Preparing secure checkout...",
  checkout_open: "Waiting for payment in Razorpay Test Mode...",
  verifying: "Verifying payment with RevenuePilot backend...",
  verified: "Payment verified",
  failed: "Payment failed or checkout was cancelled.",
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
  <section className={`context-card payment-card payment-${state}`}>
    <div className="panel-heading compact">
      <div>
        <p className="eyebrow">Razorpay checkout</p>
        <h2>{state === "verified" ? "Payment verified" : "Secure payment"}</h2>
      </div>
      <span className="mode-pill">TEST MODE</span>
    </div>
    <p>{statusCopy[state]}</p>
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
