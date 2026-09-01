import type { Product } from "../products/product.model";
import { searchProducts, type ProductSearchInput } from "../products/product.service";
import type { CatalogResult, CatalogSearchInput } from "./ai.types";

const specificationsToObject = (
  specifications: Product["specifications"],
): Record<string, string> => {
  if (specifications instanceof Map) {
    return Object.fromEntries(specifications);
  }

  return specifications;
};

export const mapCatalogResult = (
  product: Awaited<ReturnType<typeof searchProducts>>[number],
): CatalogResult => ({
  productId: product._id.toString(),
  name: product.name,
  price: product.price,
  specifications: specificationsToObject(product.specifications),
  tags: product.tags,
  useCases: product.useCases,
  matchScore: product.matchScore,
  matchReasons: product.matchReasons,
});

export const searchCatalog = async (
  input: CatalogSearchInput,
): Promise<CatalogResult[]> => {
  const searchInput: ProductSearchInput = {};

  if (input.category) {
    searchInput.category = input.category;
  }

  if (typeof input.budget === "number") {
    searchInput.budget = input.budget;
  }

  if (input.useCases) {
    searchInput.useCases = input.useCases;
  }

  if (input.preferences) {
    searchInput.preferences = input.preferences;
  }

  if (input.priorityPreferences) {
    searchInput.priorityPreferences = input.priorityPreferences;
  }

  const products = await searchProducts(searchInput);

  return products.map(mapCatalogResult);
};
