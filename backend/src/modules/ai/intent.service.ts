import type {
  IntentExtractionInput,
  MergedIntent,
  StructuredIntent,
} from "./ai.types";

const categoryPatterns = [
  { category: "laptop", patterns: ["laptop", "notebook", "macbook"] },
  { category: "monitor", patterns: ["monitor", "display", "screen"] },
  { category: "keyboard", patterns: ["keyboard"] },
  { category: "mouse", patterns: ["mouse"] },
  { category: "headphones", patterns: ["headphone", "headphones", "headset"] },
  { category: "accessory", patterns: ["hub", "stand", "accessory", "dock"] },
] as const;

const preferencePatterns = [
  { preference: "performance", patterns: ["performance", "powerful", "fast", "heavy"] },
  { preference: "battery", patterns: ["battery", "all day", "long lasting"] },
  { preference: "portable", patterns: ["portable", "lightweight", "thin", "travel"] },
  { preference: "budget", patterns: ["budget", "affordable", "cheap", "low cost"] },
  { preference: "gaming", patterns: ["gaming", "game"] },
  { preference: "creator", patterns: ["creator", "content", "editing", "design"] },
  { preference: "productivity", patterns: ["productivity", "office", "work"] },
  { preference: "machine-learning", patterns: ["machine learning", "ml"] },
  { preference: "ai-development", patterns: ["ai", "artificial intelligence"] },
] as const;

const useCasePatterns = [
  { useCase: "AI development", patterns: ["ai development", "ai", "machine learning", "ml"] },
  { useCase: "Python", patterns: ["python"] },
  { useCase: "full-stack development", patterns: ["full stack", "full-stack"] },
  { useCase: "web development", patterns: ["web development", "frontend", "backend"] },
  { useCase: "gaming", patterns: ["gaming", "game"] },
  { useCase: "college students", patterns: ["college", "student", "students"] },
  { useCase: "basic programming", patterns: ["basic programming", "beginner", "coding"] },
  { useCase: "content creation", patterns: ["content creation", "creator", "editing"] },
] as const;

const priceHesitationPatterns = [
  "too expensive",
  "cheaper",
  "something cheaper",
  "cannot afford",
  "can t afford",
  "cant afford",
  "beyond my budget",
  "costs too much",
  "price is high",
  "price high",
  "more than i wanted",
  "more than my budget",
  "costly",
  "expensive",
  "over budget",
] as const;

const strongPurchaseIntentPatterns = [
  "buy",
  "i want this",
  "i want this one",
  "buy this now",
  "can i buy",
  "let s proceed",
  "lets proceed",
  "proceed",
  "take me to checkout",
  "checkout",
  "place order",
] as const;

const comparisonPatterns = [
  "compare",
  "compared",
  "which is better",
  "which one is better",
  "difference",
  "versus",
  " vs ",
  "other one",
] as const;

const abandonmentRiskPatterns = [
  "not sure",
  "confused",
  "maybe later",
  "i will think",
  "need to think",
  "too much",
  "leave it",
  "cancel",
] as const;

const unique = (values: string[]): string[] => [...new Set(values)];

const normalized = (value: string): string =>
  value
    .toLowerCase()
    .replace(/ai\s*\/\s*ml/g, "ai machine learning ml")
    .replace(/full[-\s]?stack/g, "full stack")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasAnyPattern = (message: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => message.includes(pattern));

const extractBudget = (message: string): number | null => {
  const compactMessage = message.replace(/,/g, "");
  const match = compactMessage.match(
    /(?:under|below|around|near|upto|up to|budget|within)?\s*(?:rs\.?|inr|₹)?\s*(\d{4,7})/i,
  );

  if (!match?.[1]) {
    return null;
  }

  return Number(match[1]);
};

const detectBehavioralSignals = (
  message: string,
): Pick<
  StructuredIntent,
  "priceSensitivity" | "purchaseIntent" | "abandonmentRisk" | "customerState"
> => {
  const hasPriceHesitation = hasAnyPattern(message, priceHesitationPatterns);
  const hasStrongPurchaseIntent = hasAnyPattern(message, strongPurchaseIntentPatterns);
  const hasComparisonBehavior = hasAnyPattern(message, comparisonPatterns);
  const hasAbandonmentRisk = hasAnyPattern(message, abandonmentRiskPatterns);

  if (hasStrongPurchaseIntent) {
    return {
      priceSensitivity: null,
      purchaseIntent: "high",
      abandonmentRisk: "low",
      customerState: "ready_to_buy",
    };
  }

  if (hasPriceHesitation) {
    return {
      priceSensitivity: "high",
      purchaseIntent: "medium",
      abandonmentRisk: hasAbandonmentRisk ? "high" : "medium",
      customerState: "hesitating",
    };
  }

  if (hasComparisonBehavior) {
    return {
      priceSensitivity: null,
      purchaseIntent: "medium",
      abandonmentRisk: hasAbandonmentRisk ? "medium" : null,
      customerState: "comparing",
    };
  }

  if (hasAbandonmentRisk) {
    return {
      priceSensitivity: null,
      purchaseIntent: "low",
      abandonmentRisk: "high",
      customerState: "hesitating",
    };
  }

  return {
    priceSensitivity: null,
    purchaseIntent: null,
    abandonmentRisk: null,
    customerState: "unknown",
  };
};

export const extractIntentLocally = (
  input: IntentExtractionInput,
): StructuredIntent => {
  const message = normalized(input.latestCustomerMessage);
  const category =
    categoryPatterns.find((item) => hasAnyPattern(message, item.patterns))?.category ??
    input.currentContext.category ??
    null;

  const useCases = unique([
    ...(input.currentContext.useCases ?? []),
    ...useCasePatterns
      .filter((item) => hasAnyPattern(message, item.patterns))
      .map((item) => item.useCase),
  ]);

  const preferences = unique([
    ...(input.currentContext.preferences ?? []),
    ...preferencePatterns
      .filter((item) => hasAnyPattern(message, item.patterns))
      .map((item) => item.preference),
  ]);

  const budget = extractBudget(input.latestCustomerMessage) ?? input.currentContext.budget ?? null;
  const hasProductDiscoverySignal = Boolean(category || budget || useCases.length || preferences.length);
  const behavioralSignals = detectBehavioralSignals(message);
  const priceSensitiveMessage = /affordable|cheap|low cost/.test(message);

  return {
    intent: hasProductDiscoverySignal ? "product_search" : "unknown",
    category,
    budget,
    useCases,
    preferences,
    priceSensitivity: behavioralSignals.priceSensitivity ?? (priceSensitiveMessage ? "high" : null),
    purchaseIntent:
      behavioralSignals.purchaseIntent ?? (hasProductDiscoverySignal ? "medium" : null),
    abandonmentRisk: behavioralSignals.abandonmentRisk,
    customerState:
      behavioralSignals.customerState !== "unknown"
        ? behavioralSignals.customerState
        : hasProductDiscoverySignal
          ? "browsing"
          : "unknown",
  };
};

export const mergeExtractedIntent = (
  previousContext: Partial<StructuredIntent> & { priorityPreferences?: string[] | undefined },
  nextIntent: StructuredIntent,
): MergedIntent => {
  const hasBehaviorUpdate = nextIntent.customerState !== "unknown";

  return {
    intent: nextIntent.intent ?? previousContext.intent ?? "unknown",
    category: nextIntent.category ?? previousContext.category ?? null,
    budget: nextIntent.budget ?? previousContext.budget ?? null,
    useCases: unique([
      ...(previousContext.useCases ?? []),
      ...nextIntent.useCases,
    ]),
    preferences: unique([
      ...(previousContext.preferences ?? []),
      ...nextIntent.preferences,
    ]),
    // The customer's freshest, explicitly-restated preferences this turn
    // are the strongest available signal of current priority — a
    // generalizable, deterministic proxy for "this matters more right
    // now" without parsing comparative sentence structure (e.g. "X
    // matters more than Y"). If this turn didn't surface any new
    // preference terms, keep whatever was previously prioritized rather
    // than dropping the emphasis on an unrelated follow-up message.
    priorityPreferences:
      nextIntent.preferences.length > 0
        ? unique(nextIntent.preferences)
        : (previousContext.priorityPreferences ?? []),
    priceSensitivity: hasBehaviorUpdate
      ? nextIntent.priceSensitivity
      : previousContext.priceSensitivity ?? null,
    purchaseIntent: hasBehaviorUpdate
      ? nextIntent.purchaseIntent
      : previousContext.purchaseIntent ?? null,
    abandonmentRisk: hasBehaviorUpdate
      ? nextIntent.abandonmentRisk
      : previousContext.abandonmentRisk ?? null,
    customerState: hasBehaviorUpdate
      ? nextIntent.customerState
      : previousContext.customerState ?? "unknown",
  };
};
