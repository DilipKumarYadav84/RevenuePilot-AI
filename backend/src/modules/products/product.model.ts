import { Schema, model, models, type Model } from "mongoose";

export type ProductCategory =
  | "laptop"
  | "monitor"
  | "keyboard"
  | "mouse"
  | "headphones"
  | "accessory";

export type Product = {
  name: string;
  slug: string;
  category: ProductCategory;
  description: string;
  shortDescription: string;
  price: number;
  originalPrice?: number;
  stock: number;
  image: string;
  images: string[];
  brand: string;
  tags: string[];
  specifications: Record<string, string>;
  useCases: string[];
  rating: number;
  reviewCount: number;
  featured: boolean;
  active: boolean;
};

const productSchema = new Schema<Product>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: ["laptop", "monitor", "keyboard", "mouse", "headphones", "accessory"],
    },
    description: { type: String, required: true, trim: true },
    shortDescription: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0 },
    stock: { type: Number, required: true, min: 0 },
    image: { type: String, required: true, trim: true },
    images: [{ type: String, required: true, trim: true }],
    brand: { type: String, required: true, trim: true },
    tags: [{ type: String, required: true, trim: true }],
    specifications: { type: Map, of: String, required: true },
    useCases: [{ type: String, required: true, trim: true }],
    rating: { type: Number, required: true, min: 0, max: 5 },
    reviewCount: { type: Number, required: true, min: 0 },
    featured: { type: Boolean, required: true, default: false },
    active: { type: Boolean, required: true, default: true },
  },
  {
    timestamps: true,
  },
);

productSchema.index({ category: 1, active: 1 });
productSchema.index({ tags: 1 });

export const ProductModel: Model<Product> =
  models.Product || model<Product>("Product", productSchema);
