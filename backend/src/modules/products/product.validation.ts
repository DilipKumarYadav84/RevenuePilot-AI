import { z } from "zod";

// Mirrors ProductCategory in product.model.ts.
export const productCategorySchema = z.enum([
  "laptop",
  "monitor",
  "keyboard",
  "mouse",
  "headphones",
  "accessory",
]);

const nonEmptyTrimmedString = z.string().trim().min(1).max(80);

// Reasonable upper bounds so this endpoint can't be used to push
// oversized arrays/strings into the ranking pass in product.service.ts.
// Ranking behavior itself is unchanged by this fix — these are only
// input-shape limits.
const MAX_LIST_ITEMS = 10;
const MAX_BUDGET_RUPEES = 10_000_000; // Rs. 1 crore — generous upper bound for a TechNova catalog search

export const productSearchSchema = z
  .object({
    category: productCategorySchema.optional(),
    budget: z.number().min(0).max(MAX_BUDGET_RUPEES).optional(),
    useCases: z.array(nonEmptyTrimmedString).max(MAX_LIST_ITEMS).optional(),
    preferences: z.array(nonEmptyTrimmedString).max(MAX_LIST_ITEMS).optional(),
  })
  .strict();

export type ProductSearchRequest = z.infer<typeof productSearchSchema>;
