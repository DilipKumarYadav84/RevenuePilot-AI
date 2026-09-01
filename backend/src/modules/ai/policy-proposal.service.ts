import type { ActionProposal } from "../policies/policy.types";
import type { CatalogResult, StructuredIntent } from "./ai.types";

export const proposePolicyAction = (
  conversationId: string,
  context: StructuredIntent,
  catalogResults: CatalogResult[],
): ActionProposal => {
  const topResult = catalogResults[0];

  if (
    topResult &&
    context.customerState === "hesitating" &&
    context.priceSensitivity === "high" &&
    (context.purchaseIntent === "medium" || context.purchaseIntent === "high")
  ) {
    return {
      action: "CREATE_DISCOUNT",
      conversationId,
      productId: topResult.productId,
      orderValue: topResult.price,
      requestedDiscountPercent: 15,
      reason:
        "Customer is price sensitive, hesitating, and still showing purchase intent.",
    };
  }

  if (context.customerState === "ready_to_buy") {
    return {
      action: "START_CHECKOUT",
      conversationId,
      productId: topResult?.productId,
      orderValue: topResult?.price,
      reason: "Customer appears ready to buy.",
    };
  }

  if (context.customerState === "comparing") {
    return {
      action: "RECOMMEND_ALTERNATIVE",
      conversationId,
      productId: topResult?.productId,
      orderValue: topResult?.price,
      reason: "Customer is comparing options.",
    };
  }

  return {
    action: "NO_ACTION",
    conversationId,
    reason: "No policy-controlled business action proposed.",
  };
};
