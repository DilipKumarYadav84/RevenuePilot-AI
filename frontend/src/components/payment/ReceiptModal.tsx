import { Modal } from "../common/Modal";
import type { SafePaymentRecord } from "../../types/payment";
import { formatPaiseAsInr } from "../../utils/money";

type ReceiptModalProps = {
  payment: SafePaymentRecord;
  productName: string;
  onClose: () => void;
};

export const ReceiptModal = ({
  payment,
  productName,
  onClose,
}: ReceiptModalProps) => {
  const formattedDate = payment.verifiedAt
    ? new Date(payment.verifiedAt).toLocaleString("en-IN", {
        dateStyle: "full",
        timeStyle: "medium",
      })
    : "Not available";

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal title="Verified payment receipt" onClose={onClose}>
      <div className="receipt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-header">
          <div className="receipt-brand">
            <div className="receipt-logo-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h3>RevenuePilot AI</h3>
              <p>Razorpay Test Mode payment receipt</p>
            </div>
          </div>
          <button
            type="button"
            className="receipt-close-btn"
            onClick={onClose}
            aria-label="Close receipt"
          >
            ×
          </button>
        </div>

        <div className="receipt-badge-verified">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>Server-Side HMAC-SHA256 Signature Verified</span>
        </div>

        <div className="receipt-body">
          <div className="receipt-meta-grid">
            <div>
              <span className="meta-label">Payment ID (Razorpay)</span>
              <code className="meta-val">{payment.razorpayPaymentId || "Not available"}</code>
            </div>
            <div>
              <span className="meta-label">Order ID (Razorpay)</span>
              <code className="meta-val">{payment.razorpayOrderId || "Not available"}</code>
            </div>
            <div>
              <span className="meta-label">Verification Timestamp</span>
              <span className="meta-val">{formattedDate}</span>
            </div>
            <div>
              <span className="meta-label">Verification status</span>
              <span className="meta-val highlight-success">SERVER VERIFIED</span>
            </div>
          </div>

          <div className="receipt-line-items">
            <h4>Transaction Breakdown</h4>
            <div className="line-item-row">
              <div className="item-name">
                <strong>{productName}</strong>
                <span className="item-desc">Policy-Controlled Conversational Purchase</span>
              </div>
              <span className="item-price">{formatPaiseAsInr(payment.amount)}</span>
            </div>
            <div className="receipt-divider" />
            <div className="receipt-total-row">
              <span>Total Paid (INR)</span>
              <strong className="total-amount">{formatPaiseAsInr(payment.amount)}</strong>
            </div>
          </div>

<p className="hint">Payment confirmed by server verification. This is a test-mode receipt, not a tax invoice.</p>
        </div>

        <div className="receipt-footer">
          <button type="button" className="btn-secondary" onClick={handlePrint}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print / Save Receipt
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
};
