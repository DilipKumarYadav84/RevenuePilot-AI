import assert from "node:assert/strict";
import test from "node:test";

import type { Request, Response } from "express";

import {
  createRequireMerchantKey,
  isMatchingMerchantKey,
} from "../../src/middleware/merchantAuth.middleware";
import policyRouter from "../../src/modules/policies/policy.routes";

type ExpressLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { name: string }[];
  };
};

type MockResponse = Response & {
  statusCode?: number;
  jsonBody?: unknown;
};

const buildMockReq = (headerValue?: string): Request =>
  ({
    header: (name: string) =>
      name.toLowerCase() === "x-merchant-key" ? headerValue : undefined,
  }) as unknown as Request;

const buildMockRes = (): MockResponse => {
  const res = {} as MockResponse;
  res.status = ((code: number) => {
    res.statusCode = code;
    return res;
  }) as MockResponse["status"];
  res.json = ((body: unknown) => {
    res.jsonBody = body;
    return res;
  }) as MockResponse["json"];
  return res;
};

test("isMatchingMerchantKey: equal keys match", () => {
  assert.equal(isMatchingMerchantKey("super-secret", "super-secret"), true);
});

test("isMatchingMerchantKey: different keys (including different lengths) do not match and do not throw", () => {
  assert.equal(isMatchingMerchantKey("wrong", "super-secret"), false);
  assert.equal(isMatchingMerchantKey("", "super-secret"), false);
  assert.equal(isMatchingMerchantKey("super-secretx", "super-secret"), false);
});

test("requireMerchantKey: fails safe (503) when no admin key is configured on the server", () => {
  const middleware = createRequireMerchantKey("");
  const req = buildMockReq("anything");
  const res = buildMockRes();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 503);
});

test("requireMerchantKey: rejects (401) a request with no x-merchant-key header", () => {
  const middleware = createRequireMerchantKey("super-secret");
  const req = buildMockReq(undefined);
  const res = buildMockRes();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("requireMerchantKey: rejects (403) a request with a wrong x-merchant-key header", () => {
  const middleware = createRequireMerchantKey("super-secret");
  const req = buildMockReq("not-the-secret");
  const res = buildMockRes();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("requireMerchantKey: calls next() and does not touch the response for a correct key", () => {
  const middleware = createRequireMerchantKey("super-secret");
  const req = buildMockReq("super-secret");
  const res = buildMockRes();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, undefined);
});

test("requireMerchantKey: error responses never echo the provided key back", () => {
  const middleware = createRequireMerchantKey("super-secret");
  const req = buildMockReq("attacker-guess-12345");
  const res = buildMockRes();

  middleware(req, res, () => {});

  const serialized = JSON.stringify(res.jsonBody);
  assert.equal(serialized.includes("attacker-guess-12345"), false);
});

test("route wiring: PATCH /api/policies runs requireMerchantKey before updatePolicyController", () => {
  const stack = (policyRouter as unknown as { stack: ExpressLayer[] }).stack;
  const patchLayer = stack.find(
    (layer) => layer.route?.path === "/" && layer.route.methods.patch,
  );

  assert.ok(patchLayer, "expected a PATCH / route on the policy router");
  const handlerNames = patchLayer!.route!.stack.map((handler) => handler.name);

  assert.deepEqual(handlerNames, [
    "requireMerchantKey",
    "updatePolicyController",
  ]);
});

test("route wiring: GET /api/policies and POST /api/policies/evaluate remain unauthenticated (customer/read-only)", () => {
  const stack = (policyRouter as unknown as { stack: ExpressLayer[] }).stack;

  const getLayer = stack.find(
    (layer) => layer.route?.path === "/" && layer.route.methods.get,
  );
  const evaluateLayer = stack.find(
    (layer) => layer.route?.path === "/evaluate" && layer.route.methods.post,
  );

  assert.ok(getLayer);
  assert.ok(evaluateLayer);
  assert.deepEqual(
    getLayer!.route!.stack.map((handler) => handler.name),
    ["getPolicyController"],
  );
  assert.deepEqual(
    evaluateLayer!.route!.stack.map((handler) => handler.name),
    ["evaluatePolicyController"],
  );
});
