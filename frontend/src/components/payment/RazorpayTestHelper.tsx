import { useState } from "react";
import { Modal } from "../common/Modal";

export const RazorpayTestHelper = () => {
  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  return <div className="test-credentials-wrapper">
    <button type="button" className="test-credentials-trigger" aria-haspopup="dialog" onClick={() => setOpen(true)}>Razorpay Test Mode Helper</button>
    {open && <Modal title="Razorpay Test Mode Helper" onClose={() => setOpen(false)}>
      <header className="modal-heading"><div><p className="eyebrow">Checkout utility</p><h2>Razorpay Test Mode Helper</h2></div>
        <button className="secondary-action" onClick={() => setOpen(false)}>Close</button></header>
      <p>Choose Card in test checkout. Use a future expiry date and any three-digit CVV.</p>
      <div className="test-card-details"><strong>Visa test card</strong><code>4111 1111 1111 1111</code>
        <button className="secondary-action" onClick={() => {
          void navigator.clipboard.writeText("4111111111111111").then(() => setCopyStatus("Copied test card number.")).catch(() => setCopyStatus("Copy unavailable. Select the number above."));
        }}>Copy test card</button><p role="status">{copyStatus}</p></div>
      <p>On the mock bank page, choose Success or Failure to test the result. RevenuePilot confirms success only after server verification.</p>
      <p className="hint">Test mode only. No real money is charged.</p>
      <a href="https://razorpay.com/docs/payments/payments/test-card-details/" target="_blank" rel="noreferrer">Razorpay test payment instructions</a>
    </Modal>}
  </div>;
};
