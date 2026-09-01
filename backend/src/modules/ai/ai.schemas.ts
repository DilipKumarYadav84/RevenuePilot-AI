import { z } from "zod";

export const aiIntentSchema = z.enum([
  "product_search",
  "general_question",
  "unknown",
]);

export const aiProductCategorySchema = z.enum([
  "laptop",
  "monitor",
  "keyboard",
  "mouse",
  "headphones",
  "accessory",
]);

export const structuredIntentSchema = z
  .object({
    intent: aiIntentSchema,
    category: aiProductCategorySchema.nullable(),
    budget: z.number().min(0).nullable(),
    useCases: z.array(z.string().trim().min(1)),
    preferences: z.array(z.string().trim().min(1)),
    priceSensitivity: z.enum(["low", "medium", "high"]).nullable(),
    purchaseIntent: z.enum(["low", "medium", "high"]).nullable(),
    abandonmentRisk: z.enum(["low", "medium", "high"]).nullable(),
    customerState: z.enum([
      "browsing",
      "comparing",
      "hesitating",
      "ready_to_buy",
      "unknown",
    ]),
  })
  .strict();
