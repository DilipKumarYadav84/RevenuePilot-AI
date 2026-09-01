import assert from "node:assert/strict";
import test from "node:test";

import { productSearchSchema } from "../../src/modules/products/product.validation";

test("accepts a well-formed search with all supported fields", () => {
  const parsed = productSearchSchema.safeParse({
    category: "laptop",
    budget: 70000,
    useCases: ["AI development"],
    preferences: ["battery"],
  });

  assert.equal(parsed.success, true);
});

test("accepts an empty search (no filters)", () => {
  const parsed = productSearchSchema.safeParse({});

  assert.equal(parsed.success, true);
});

test("rejects an unknown category", () => {
  const parsed = productSearchSchema.safeParse({ category: "smartphone" });

  assert.equal(parsed.success, false);
});

test("rejects a negative budget", () => {
  const parsed = productSearchSchema.safeParse({ budget: -1 });

  assert.equal(parsed.success, false);
});

test("rejects a non-numeric budget", () => {
  const parsed = productSearchSchema.safeParse({ budget: "70000" });

  assert.equal(parsed.success, false);
});

test("rejects an unreasonably large budget", () => {
  const parsed = productSearchSchema.safeParse({ budget: 50_000_000 });

  assert.equal(parsed.success, false);
});

test("rejects a useCases array that is too long", () => {
  const parsed = productSearchSchema.safeParse({
    useCases: Array.from({ length: 11 }, (_, i) => `use case ${i}`),
  });

  assert.equal(parsed.success, false);
});

test("rejects a preferences array with an oversized string", () => {
  const parsed = productSearchSchema.safeParse({
    preferences: ["a".repeat(500)],
  });

  assert.equal(parsed.success, false);
});

test("rejects an empty-string preference", () => {
  const parsed = productSearchSchema.safeParse({ preferences: [""] });

  assert.equal(parsed.success, false);
});

test("rejects unknown fields (strict schema)", () => {
  const parsed = productSearchSchema.safeParse({
    category: "laptop",
    sortBy: "price_asc",
  });

  assert.equal(parsed.success, false);
});

test("rejects a non-array useCases value", () => {
  const parsed = productSearchSchema.safeParse({ useCases: "AI development" });

  assert.equal(parsed.success, false);
});
