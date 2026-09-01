const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const RAZORPAY_SCRIPT_ID = "razorpay-checkout-js";

let checkoutScriptPromise: Promise<void> | null = null;

export class RazorpayScriptError extends Error {
  constructor() {
    super("Razorpay checkout could not be loaded. Please check your connection and retry.");
  }
}

export const loadRazorpayScript = (): Promise<void> => {
  if (window.Razorpay) {
    return Promise.resolve();
  }

  if (checkoutScriptPromise) {
    return checkoutScriptPromise;
  }

  const existingScript = document.getElementById(RAZORPAY_SCRIPT_ID);

  if (existingScript) {
    checkoutScriptPromise = new Promise((resolve, reject) => {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new RazorpayScriptError()),
        { once: true },
      );
    });
    return checkoutScriptPromise;
  }

  checkoutScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = RAZORPAY_SCRIPT_ID;
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.async = true;

    script.onload = () => resolve();
    script.onerror = () => {
      checkoutScriptPromise = null;
      script.remove();
      reject(new RazorpayScriptError());
    };

    document.body.appendChild(script);
  });

  return checkoutScriptPromise;
};
