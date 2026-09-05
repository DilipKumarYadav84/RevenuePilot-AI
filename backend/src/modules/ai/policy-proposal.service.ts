import type { ActionProposal } from "../policies/policy.types";
import type { CatalogResult, StructuredIntent } from "./ai.types";

// Resolve only exact, unambiguous names among the server's eligible catalog results.
// This changes the focus, never the catalog ranking, price, or policy rules.
export const getFocusedCatalogResult = (results: CatalogResult[], message = "", previousProductId?: string): CatalogResult | undefined => {
  const normalize = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const normalized = normalize(message);
  const matches = results.filter(product => normalized.includes(normalize(product.name)));
  return matches.length === 1 ? matches[0] : results.find(product => product.productId === previousProductId) ?? results[0];
};

export const proposePolicyAction = (
  conversationId: string,
  context: StructuredIntent,
  catalogResults: CatalogResult[],
  latestCustomerMessage = "",
  previousProductId?: string,
): ActionProposal => {
  const topResult = getFocusedCatalogResult(catalogResults, latestCustomerMessage, previousProductId);

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
