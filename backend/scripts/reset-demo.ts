import mongoose from "mongoose";

import { connectDatabase } from "../src/config/db";
import { AuditEventModel } from "../src/modules/audit/audit.model";
import { ConversationModel } from "../src/modules/conversations/conversation.model";
import { OfferModel } from "../src/modules/offers/offer.model";
import { PaymentModel } from "../src/modules/payments/payment.model";
import {
  MerchantPolicyModel,
  PolicyDecisionModel,
} from "../src/modules/policies/policy.model";
import { defaultMerchantPolicy } from "../src/modules/policies/policy.service";
import { ProductModel } from "../src/modules/products/product.model";
import { brand, products } from "./seed";

const resetDemo = async (): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("reset:demo refuses to run when NODE_ENV=production.");
  }

  await connectDatabase();

  const [
    conversations,
    offers,
    payments,
    auditEvents,
    policyDecisions,
    policies,
    removedProducts,
  ] = await Promise.all([
    ConversationModel.deleteMany({}).exec(),
    OfferModel.deleteMany({}).exec(),
    PaymentModel.deleteMany({}).exec(),
    AuditEventModel.deleteMany({}).exec(),
    PolicyDecisionModel.deleteMany({}).exec(),
    MerchantPolicyModel.deleteMany({}).exec(),
    ProductModel.deleteMany({ brand }).exec(),
  ]);

  const insertedProducts = await ProductModel.insertMany(products, {
    ordered: true,
  });
  await MerchantPolicyModel.create(defaultMerchantPolicy);

  console.log("RevenuePilot demo data reset complete.");
  console.log(`Removed ${conversations.deletedCount} conversations.`);
  console.log(`Removed ${offers.deletedCount} offers.`);
  console.log(`Removed ${payments.deletedCount} payments.`);
  console.log(`Removed ${auditEvents.deletedCount} audit events.`);
  console.log(`Removed ${policyDecisions.deletedCount} policy decisions.`);
  console.log(`Removed ${policies.deletedCount} merchant policies.`);
  console.log(`Removed ${removedProducts.deletedCount} ${brand} products.`);
  console.log(`Seeded ${insertedProducts.length} ${brand} products.`);
  console.log("Seeded default merchant policy.");
};

resetDemo()
  .catch((error: unknown) => {
    console.error("Demo reset failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void mongoose.connection.close();
  });
