import { useCallback, useRef, useState } from "react";
import {
  createPaymentOrder,
  verifyPayment,
} from "../services/payment.service";
import { loadRazorpayScript } from "../services/razorpay-loader";
import type { SafePaymentRecord } from "../types/payment";
import type {
  RazorpayOptions,
  RazorpaySuccessResponse,
} from "../types/razorpay";

export type PaymentState =
  | "idle"
  | "loading_order"
  | "checkout_open"
  | "verifying"
  | "verified"
  | "failed";

export type CheckoutInput = {
  offerId: string;
  productName: string;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
};

type CheckoutResult = {
  state: PaymentState;
  errorMessage: string | null;
  verifiedPayment: SafePaymentRecord | null;
  paymentRecordId: string | null;
  startCheckout: (input: CheckoutInput) => Promise<void>;
  reset: () => void;
};

const buildIdempotencyKey = (offerId: string): string =>
  `rp_checkout_${offerId}`;


export const useRazorpayCheckout = (): CheckoutResult => {
  const [state, setState] = useState<PaymentState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifiedPayment, setVerifiedPayment] =
    useState<SafePaymentRecord | null>(null);
  const [paymentRecordId, setPaymentRecordId] = useState<string | null>(null);
  const isBusyRef = useRef(false);

  const reset = useCallback(() => {
    if (isBusyRef.current) {
      return;
    }

    setState("idle");
    setErrorMessage(null);
    setVerifiedPayment(null);
    setPaymentRecordId(null);
  }, []);

  const startCheckout = useCallback(
    async ({ offerId, productName, customer }: CheckoutInput) => {
      if (isBusyRef.current) {
        return;
      }

      isBusyRef.current = true;
      setState("loading_order");
      setErrorMessage(null);
      setVerifiedPayment(null);

      try {
        await loadRazorpayScript();

        if (!window.Razorpay) {
          throw new Error("Razorpay checkout is unavailable. Please retry.");
        }

        const order = await createPaymentOrder(
          offerId,
          buildIdempotencyKey(offerId),
        );
        setPaymentRecordId(order.paymentRecordId);

        const options: RazorpayOptions = {
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: "TechNova",
          description: `${productName} purchase`,
          order_id: order.razorpayOrderId,
          prefill: customer,
          notes: {
            offerId,
            paymentRecordId: order.paymentRecordId,
          },
          theme: {
            color: "#2563eb",
          },
          handler: (response: RazorpaySuccessResponse) => {
            setState("verifying");
            void verifyPayment({
              paymentRecordId: order.paymentRecordId,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            })
              .then((payment) => {
                if (payment.status !== "verified") {
                  throw new Error("Payment verification did not complete.");
                }

                setVerifiedPayment(payment);
                setState("verified");
              })
              .catch(() => {
                setErrorMessage(
                  "Payment verification failed. Please retry.",
                );
                setState("failed");
              })
              .finally(() => {
                isBusyRef.current = false;
              });
          },
          modal: {
            ondismiss: () => {
              if (isBusyRef.current) {
                setErrorMessage("Checkout was closed before payment was completed.");
                setState("failed");
                isBusyRef.current = false;
              }
            },
          },
        };

        const checkout = new window.Razorpay(options);
        checkout.on("payment.failed", () => {
          setErrorMessage("Payment was not completed. You can retry securely.");
          setState("failed");
          isBusyRef.current = false;
        });
        checkout.open();
        setState("checkout_open");
      } catch {
        setErrorMessage(
          "Checkout could not be started. Please retry.",
        );
        setState("failed");
        isBusyRef.current = false;
      }
    },
    [],
  );

  return {
    state,
    errorMessage,
    verifiedPayment,
    paymentRecordId,
    startCheckout,
    reset,
  };
};
