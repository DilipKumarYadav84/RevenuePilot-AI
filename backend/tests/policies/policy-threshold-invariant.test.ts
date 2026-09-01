import assert from "node:assert/strict";
import test from "node:test";

import {
  computeUpdatedMerchantPolicy,
  defaultMerchantPolicy,
  PolicyUpdateValidationError,
} from "../../src/modules/policies/policy.service";
import { merchantPolicyUpdateSchema } from "../../src/modules/policies/policy.validation";
import type { MerchantPolicy } from "../../src/modules/policies/policy.types";

// ---- Zod schema layer ----

test("Zod: threshold strictly below max is accepted", () => {
  const parsed = merchantPolicyUpdateSchema.safeParse({
    maxDiscountPercent: 10,
    approvalThresholdPercent: 8,
  });

  assert.equal(parsed.success, true);
});

test("Zod: threshold equal to max is rejected", () => {
  const parsed = merchantPolicyUpdateSchema.safeParse({
    maxDiscountPercent: 10,
    approvalThresholdPercent: 10,
  });

  assert.equal(parsed.success, false);
});

test("Zod: threshold above max is rejected", () => {
  const parsed = merchantPolicyUpdateSchema.safeParse({
    maxDiscountPercent: 5,
    approvalThresholdPercent: 8,
  });

  assert.equal(parsed.success, false);
});

// ---- Service/business-validation layer (computeUpdatedMerchantPolicy) ----
// This is the layer that matters most: it validates against the *merged*
// existing+update policy, not just fields present together in one request.

const existingPolicy: MerchantPolicy = {
  ...defaultMerchantPolicy, // maxDiscountPercent: 10, approvalThresholdPercent: 8
};

test("service: the current default policy (8 < 10) is itself valid and requires no changes to pass", () => {
  const result = computeUpdatedMerchantPolicy(existingPolicy, {});

  assert.equal(result.approvalThresholdPercent, 8);
  assert.equal(result.maxDiscountPercent, 10);
});

test("service: raising approvalThresholdPercent alone to equal the existing maxDiscountPercent is rejected", () => {
  assert.throws(
    () => computeUpdatedMerchantPolicy(existingPolicy, { approvalThresholdPercent: 10 }),
    PolicyUpdateValidationError,
  );
});

test("service: lowering maxDiscountPercent alone to equal the existing approvalThresholdPercent is rejected", () => {
  assert.throws(
    () => computeUpdatedMerchantPolicy(existingPolicy, { maxDiscountPercent: 8 }),
    PolicyUpdateValidationError,
  );
});

test("service: raising approvalThresholdPercent above the existing maxDiscountPercent is rejected", () => {
  assert.throws(
    () => computeUpdatedMerchantPolicy(existingPolicy, { approvalThresholdPercent: 25 }),
    PolicyUpdateValidationError,
  );
});

test("service: a valid strict update (threshold below max) is accepted and merged correctly", () => {
  const result = computeUpdatedMerchantPolicy(existingPolicy, {
    maxDiscountPercent: 20,
    approvalThresholdPercent: 15,
  });

  assert.equal(result.maxDiscountPercent, 20);
  assert.equal(result.approvalThresholdPercent, 15);
});

test("service: updating an unrelated field (e.g. offerExpiryMinutes) does not require touching thresholds", () => {
  const result = computeUpdatedMerchantPolicy(existingPolicy, { offerExpiryMinutes: 20 });

  assert.equal(result.offerExpiryMinutes, 20);
  assert.equal(result.approvalThresholdPercent, 8);
  assert.equal(result.maxDiscountPercent, 10);
});
