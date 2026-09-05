import type { Offer } from "../offers/offer.types";
import type { PaymentRecord } from "../payments/payment.types";
import type { PolicyDecision } from "../policies/policy.types";
import type { CatalogResult } from "./ai.types";

export type CommerceState = "DISCOVERY" | "COMPARING" | "PRODUCT_FOCUSED" | "HESITATING" | "OFFER_AVAILABLE" | "OFFER_ACCEPTED" | "CHECKOUT_READY" | "PAYMENT_VERIFIED";

export const deriveCommerceState = (offer: Offer | null, payment: PaymentRecord | null): CommerceState => {
  if (payment?.status === "verified") return "PAYMENT_VERIFIED";
  if (offer?.status === "accepted") return offer.actionType === "START_CHECKOUT" ? "CHECKOUT_READY" : "OFFER_ACCEPTED";
  if (offer?.status === "created" && offer.expiresAt.getTime() > Date.now()) return "OFFER_AVAILABLE";
  return "DISCOVERY";
};

const formatPaise = (amount: number): string => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(amount / 100);

export const buildCommerceResponse = ({
  state, offer, focusedProduct, policyDecision,
}: {
  state: CommerceState;
  offer: Offer | null;
  focusedProduct?: CatalogResult | undefined;
  policyDecision?: PolicyDecision | undefined;
}): string | null => {
  const productName = focusedProduct?.name ?? "this product";
  if (state === "PAYMENT_VERIFIED") return `Your payment for ${productName} has been verified successfully.`;
  if ((state === "OFFER_ACCEPTED" || state === "CHECKOUT_READY") && offer) {
    return `Your merchant-approved offer for ${productName} is already accepted at ${formatPaise(offer.finalAmount)}. Complete the secure Razorpay checkout to finish your purchase.`;
  }
  if (state === "OFFER_AVAILABLE" && offer) {
    return `You already have a merchant-approved ${offer.approvedDiscountPercent}% offer for ${productName}, bringing the price to ${formatPaise(offer.finalAmount)}. Accept the offer to continue.`;
  }
  if (policyDecision?.requestedAction.action === "CREATE_DISCOUNT") {
    if (policyDecision.decision === "MODIFIED" && policyDecision.approvedAction?.approvedDiscountPercent !== undefined) {
      return `You like the ${productName}, but price is the concern. The AI proposed 15% off; merchant policy caps the executable discount at ${policyDecision.approvedAction.approvedDiscountPercent}%.`;
    }
    if (policyDecision.decision === "APPROVED" && policyDecision.approvedAction?.approvedDiscountPercent !== undefined) {
      return `I checked merchant policy for ${productName}. A ${policyDecision.approvedAction.approvedDiscountPercent}% offer is available for you to review.`;
    }
    return `I checked merchant policy for ${productName}. ${policyDecision.reason}`;
  }
  if (policyDecision?.requestedAction.action === "START_CHECKOUT") {
    return `${productName} is selected and ready for checkout.`;
  }
  return null;
};
