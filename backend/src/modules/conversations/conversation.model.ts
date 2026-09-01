import { Schema, model, models, type Model } from "mongoose";

import type {
  Conversation,
  ConversationMessage,
  ExtractedConversationContext,
} from "./conversation.types";

const messageSchema = new Schema<ConversationMessage>(
  {
    role: {
      type: String,
      required: true,
      enum: ["customer", "assistant", "system", "tool"],
    },
    content: { type: String, required: true, trim: true },
    timestamp: { type: Date, required: true, default: Date.now },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    _id: false,
  },
);

const extractedContextSchema = new Schema<ExtractedConversationContext>(
  {
    intent: { type: String, default: null, trim: true },
    category: {
      type: String,
      enum: ["laptop", "monitor", "keyboard", "mouse", "headphones", "accessory", null],
      default: null,
    },
    budget: { type: Number, min: 0, default: null },
    useCases: [{ type: String, trim: true }],
    preferences: [{ type: String, trim: true }],
    priorityPreferences: [{ type: String, trim: true }],
    priceSensitivity: {
      type: String,
      enum: ["low", "medium", "high", null],
      default: null,
    },
    purchaseIntent: {
      type: String,
      enum: ["low", "medium", "high", null],
      default: null,
    },
    abandonmentRisk: {
      type: String,
      enum: ["low", "medium", "high", null],
      default: null,
    },
    customerState: {
      type: String,
      enum: ["browsing", "comparing", "hesitating", "ready_to_buy", "unknown"],
      default: "unknown",
    },
    lastUpdatedAt: { type: Date, default: null },
  },
  {
    _id: false,
  },
);

const conversationSchema = new Schema<Conversation>(
  {
    sessionId: { type: String, required: true, unique: true, trim: true },
    customerId: { type: String, trim: true },
    status: {
      type: String,
      required: true,
      enum: ["active", "converted", "abandoned", "closed"],
      default: "active",
    },
    messages: { type: [messageSchema], default: [] },
    extractedContext: { type: extractedContextSchema, default: () => ({}) },
    recommendedProductIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Product" }],
      default: [],
    },
    selectedProductId: { type: Schema.Types.ObjectId, ref: "Product" },
  },
  {
    timestamps: true,
  },
);

conversationSchema.index({ customerId: 1, createdAt: -1 });
conversationSchema.index({ status: 1, updatedAt: -1 });

export const ConversationModel: Model<Conversation> =
  models.Conversation || model<Conversation>("Conversation", conversationSchema);
