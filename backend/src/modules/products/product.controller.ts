import type { Request, Response } from "express";
import { Types } from "mongoose";
import type { ZodError } from "zod";

import {
  compareProducts,
  getActiveProductById,
  getActiveProducts,
  searchProducts,
} from "./product.service";
import { productSearchSchema } from "./product.validation";

class ProductValidationError extends Error {
  statusCode = 400;

  constructor(error: ZodError) {
    super(error.issues.map((issue) => issue.message).join("; "));
  }
}

const validateRequest = <T>(schema: { parse: (value: unknown) => T }, value: unknown): T => {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new ProductValidationError(error as ZodError);
  }
};

export const getProducts = async (_req: Request, res: Response): Promise<void> => {
  const products = await getActiveProducts();

  res.status(200).json({
    success: true,
    data: products,
  });
};

export const getProductById = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const { id } = req.params;

  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid product id",
    });
    return;
  }

  const product = await getActiveProductById(id);

  if (!product) {
    res.status(404).json({
      success: false,
      message: "Active product not found",
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: product,
  });
};

export const searchProductRecommendations = async (
  req: Request<Record<string, never>, unknown, unknown>,
  res: Response,
): Promise<void> => {
  const parsed = validateRequest(productSearchSchema, req.body ?? {});
  // Strip explicit `undefined` values so this satisfies ProductSearchInput
  // under exactOptionalPropertyTypes without changing ranking behavior —
  // an omitted field and an explicit `undefined` field mean the same thing
  // to searchProducts().
  const input = Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined),
  );
  const rankedProducts = await searchProducts(input);

  res.status(200).json({
    success: true,
    count: rankedProducts.length,
    data: rankedProducts,
  });
};

export const compareProductOptions = async (
  req: Request<Record<string, never>, unknown, { productIds?: unknown }>,
  res: Response,
): Promise<void> => {
  const { productIds } = req.body;

  if (!Array.isArray(productIds)) {
    res.status(400).json({
      success: false,
      message: "productIds must be an array",
    });
    return;
  }

  if (productIds.length < 2 || productIds.length > 4) {
    res.status(400).json({
      success: false,
      message: "Compare requires between 2 and 4 product ids",
    });
    return;
  }

  if (!productIds.every((productId): productId is string => typeof productId === "string")) {
    res.status(400).json({
      success: false,
      message: "Each product id must be a string",
    });
    return;
  }

  const uniqueProductIds = [...new Set(productIds)];

  if (uniqueProductIds.length !== productIds.length) {
    res.status(400).json({
      success: false,
      message: "Product ids must be unique",
    });
    return;
  }

  const invalidProductIds = productIds.filter(
    (productId) => !Types.ObjectId.isValid(productId),
  );

  if (invalidProductIds.length > 0) {
    res.status(400).json({
      success: false,
      message: "One or more product ids are invalid",
      invalidProductIds,
    });
    return;
  }

  const comparison = await compareProducts(productIds);

  if (comparison.length !== productIds.length) {
    res.status(404).json({
      success: false,
      message: "One or more active products were not found",
    });
    return;
  }

  res.status(200).json({
    success: true,
    count: comparison.length,
    data: comparison,
  });
};
