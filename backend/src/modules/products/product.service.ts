import { Types } from "mongoose";

import { ProductModel, type Product, type ProductCategory } from "./product.model";

export type ProductSearchInput = {
  category?: ProductCategory;
  budget?: number;
  useCases?: string[];
  preferences?: string[];
  // The subset of `preferences` the customer explicitly (re)stated most
  // recently — see PRIORITY_PREFERENCE_WEIGHT below for how this is used.
  priorityPreferences?: string[];
};

export type RankedProduct = Product & {
  _id: Types.ObjectId;
  matchScore: number;
  matchReasons: string[];
};

export type ProductComparisonItem = {
  id: string;
  name: string;
  price: number;
  specifications: Record<string, string>;
  tags: string[];
  useCases: string[];
  rating: number;
};

type ProductSearchQuery = {
  active: true;
  category?: ProductCategory;
  price?: {
    $lte: number;
  };
};

const CATEGORY_WEIGHT = 30;
const BUDGET_WEIGHT = 25;
const USE_CASE_WEIGHT = 16;
const TAG_WEIGHT = 8;
const PREFERENCE_WEIGHT = 10;
// Explicit, freshly-restated preferences ("priorityPreferences") need to be
// able to outweigh a secondary feature advantage that only shows up via
// category/use-case/rating scoring — e.g. a customer saying "battery life
// matters more than GPU power" should be able to move a genuinely
// battery-strong in-budget, in-category alternative ahead of a higher
// use-case-matching, higher-rated product that has no battery-related
// catalog data at all. This weight is deliberately close to
// CATEGORY_WEIGHT: strong enough to flip a ranking on real per-product
// score gaps, while remaining additive (never a hard override) — a
// priority preference match still cannot resurrect a product that was
// excluded by the category/budget query above, or fabricate a match
// against catalog data that doesn't actually mention it.
const PRIORITY_PREFERENCE_WEIGHT = 25;
const RATING_WEIGHT = 2;
const BUDGET_FALLBACK_TOLERANCE = 1.1;

const productCategories = new Set<ProductCategory>([
  "laptop",
  "monitor",
  "keyboard",
  "mouse",
  "headphones",
  "accessory",
]);

const isProductCategory = (category: unknown): category is ProductCategory =>
  typeof category === "string" && productCategories.has(category as ProductCategory);

const normalizeText = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/ai\s*\/\s*ml/g, "ai ml machine learning")
    .replace(/machine[-\s]?learning/g, "machine learning ml")
    .replace(/full[-\s]?stack/g, "full stack")
    .replace(/web[-\s]?development/g, "web development")
    .replace(/ai[-\s]?development/g, "ai development")
    .replace(/gpu[-\s]?heavy/g, "gpu heavy")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const toTokens = (value: string): Set<string> =>
  new Set(normalizeText(value).split(" ").filter(Boolean));

const tokenOverlap = (query: string, candidates: string[]): boolean => {
  const queryTokens = toTokens(query);

  if (queryTokens.size === 0) {
    return false;
  }

  return candidates.some((candidate) => {
    const candidateTokens = toTokens(candidate);
    const overlapCount = [...queryTokens].filter((token) =>
      candidateTokens.has(token),
    ).length;

    return overlapCount === queryTokens.size || overlapCount >= 2;
  });
};

const countMatches = (queries: string[], candidates: string[]): number =>
  queries.filter((query) => tokenOverlap(query, candidates)).length;

const specificationEntries = (
  specifications: Product["specifications"],
): Record<string, string> => {
  if (specifications instanceof Map) {
    return Object.fromEntries(specifications);
  }

  return specifications;
};

export const getActiveProducts = async (): Promise<Product[]> => {
  return ProductModel.find({ active: true })
    .sort({
      featured: -1,
      category: 1,
      price: 1,
    })
    .lean<Product[]>()
    .exec();
};

export const getActiveProductById = async (
  productId: string,
): Promise<(Product & { _id: Types.ObjectId }) | null> => {
  return ProductModel.findOne({
    _id: productId,
    active: true,
  })
    .lean<Product & { _id: Types.ObjectId }>()
    .exec();
};

/**
 * Pure per-product scoring step, extracted from searchProducts() so the
 * ranking/weighting logic — including the priority-preference boost — is
 * directly unit-testable against hand-built product fixtures, without a
 * database.
 */
export const scoreProduct = (
  product: Product,
  input: ProductSearchInput,
): { matchScore: number; matchReasons: string[] } => {
  let matchScore = 0;
  const matchReasons: string[] = [];
  const searchableFields = [
    product.name,
    product.category,
    product.description,
    product.shortDescription,
    ...product.tags,
    ...product.useCases,
    ...Object.values(specificationEntries(product.specifications)),
  ];

  if (input.category && product.category === input.category) {
    matchScore += CATEGORY_WEIGHT;
    matchReasons.push(`Category matches ${input.category}`);
  }

  if (typeof input.budget === "number") {
    if (product.price <= input.budget) {
      const budgetFit = 1 - Math.min(input.budget - product.price, input.budget) / input.budget;
      matchScore += BUDGET_WEIGHT + Math.round(budgetFit * 5);
      matchReasons.push(`Within budget at Rs. ${product.price}`);
    } else {
      const overBudgetRatio = (product.price - input.budget) / input.budget;
      matchScore -= Math.ceil(overBudgetRatio * 20);
      matchReasons.push(
        `Fallback candidate within 10% budget tolerance, above budget by Rs. ${
          product.price - input.budget
        }`,
      );
    }
  }

  const useCaseMatches = countMatches(input.useCases ?? [], [
    ...product.useCases,
    ...product.tags,
    product.description,
    product.shortDescription,
  ]);

  if (useCaseMatches > 0) {
    matchScore += useCaseMatches * USE_CASE_WEIGHT;
    matchReasons.push(`${useCaseMatches} use-case match${useCaseMatches === 1 ? "" : "es"}`);
  }

  const tagMatches = countMatches(input.preferences ?? [], product.tags);

  if (tagMatches > 0) {
    matchScore += tagMatches * TAG_WEIGHT;
    matchReasons.push(`${tagMatches} tag match${tagMatches === 1 ? "" : "es"}`);
  }

  const preferenceMatches = countMatches(input.preferences ?? [], searchableFields);

  if (preferenceMatches > 0) {
    matchScore += preferenceMatches * PREFERENCE_WEIGHT;
    matchReasons.push(
      `${preferenceMatches} preference match${preferenceMatches === 1 ? "" : "es"}`,
    );
  }

  const priorityPreferenceMatches = countMatches(
    input.priorityPreferences ?? [],
    searchableFields,
  );

  if (priorityPreferenceMatches > 0) {
    matchScore += priorityPreferenceMatches * PRIORITY_PREFERENCE_WEIGHT;
    matchReasons.push(
      `${priorityPreferenceMatches} priority preference match${
        priorityPreferenceMatches === 1 ? "" : "es"
      }`,
    );
  }

  matchScore += Math.round(product.rating * RATING_WEIGHT);

  return { matchScore, matchReasons };
};

/**
 * Pure ranking/sort step, extracted for the same reason as scoreProduct
 * above. Ranking behavior (score desc, then rating desc, then price asc)
 * is unchanged by FIX 6 — only the score inputs changed.
 */
export const rankScoredProducts = <T extends { matchScore: number; rating: number; price: number }>(
  scoredProducts: T[],
): T[] =>
  [...scoredProducts].sort((first, second) => {
    if (second.matchScore !== first.matchScore) {
      return second.matchScore - first.matchScore;
    }

    if (second.rating !== first.rating) {
      return second.rating - first.rating;
    }

    return first.price - second.price;
  });

export const searchProducts = async (
  input: ProductSearchInput,
): Promise<RankedProduct[]> => {
  const productQuery: ProductSearchQuery = {
    active: true,
  };

  if (isProductCategory(input.category)) {
    productQuery.category = input.category;
  }

  if (typeof input.budget === "number") {
    productQuery.price = {
      $lte: Math.floor(input.budget * BUDGET_FALLBACK_TOLERANCE),
    };
  }

  const products = await ProductModel.find(productQuery)
    .lean<(Product & { _id: Types.ObjectId })[]>()
    .exec();

  const rankedProducts = products.map((product) => ({
    ...product,
    ...scoreProduct(product, input),
  }));

  return rankScoredProducts(rankedProducts);
};

export const compareProducts = async (
  productIds: string[],
): Promise<ProductComparisonItem[]> => {
  const products = await ProductModel.find({
    _id: { $in: productIds },
    active: true,
  })
    .lean<(Product & { _id: Types.ObjectId })[]>()
    .exec();

  const productById = new Map(
    products.map((product) => [product._id.toString(), product]),
  );

  return productIds
    .map((productId) => productById.get(productId))
    .filter((product): product is Product & { _id: Types.ObjectId } => Boolean(product))
    .map((product) => ({
      id: product._id.toString(),
      name: product.name,
      price: product.price,
      specifications: specificationEntries(product.specifications),
      tags: product.tags,
      useCases: product.useCases,
      rating: product.rating,
    }));
};
