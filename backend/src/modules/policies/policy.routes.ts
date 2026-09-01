import { Router } from "express";

import { requireMerchantKey } from "../../middleware/merchantAuth.middleware";
import {
  evaluatePolicyController,
  getPolicyController,
  updatePolicyController,
} from "./policy.controller";

const policyRouter = Router();

policyRouter.get("/", getPolicyController);
// Merchant-only mutation: requires x-merchant-key. See
// middleware/merchantAuth.middleware.ts for the Buildathon-safe approach.
policyRouter.patch("/", requireMerchantKey, updatePolicyController);
policyRouter.post("/evaluate", evaluatePolicyController);

export default policyRouter;
