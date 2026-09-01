import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { env } from "../config/env";

/**
 * Buildathon-safe merchant/admin protection.
 *
 * This is intentionally NOT a production auth system (no sessions, no
 * users, no roles) — see FIX 2 in the pre-demo hardening pass. It exists
 * to close the gap where any anonymous client could PATCH /api/policies
 * (or any other route this middleware is applied to) with no credentials
 * at all.
 *
 * Approach (option B from the review): protect direct/external API access
 * to merchant-only mutation routes with a shared secret sent as the
 * "x-merchant-key" header, compared using a timing-safe, fixed-length
 * comparison. This secret must never be shipped in the customer-facing
 * frontend bundle — it is intended for merchant/admin tooling (curl,
 * Postman, an internal merchant console screen, etc.), not the public
 * shopping experience. If a browser-based merchant console needs to call
 * this route during a demo, treat that as Buildathon-only convenience,
 * not real security — a Vite env var would be visible in the shipped
 * bundle and provides no actual protection.
 *
 * Fails safe: if MERCHANT_ADMIN_KEY is not configured on the server, the
 * route is blocked (503) rather than silently left open.
 */

const HEADER_NAME = "x-merchant-key";

const toFixedLengthDigest = (value: string): Buffer =>
  createHash("sha256").update(value, "utf8").digest();

export const isMatchingMerchantKey = (
  provided: string,
  expected: string,
): boolean => {
  const providedDigest = toFixedLengthDigest(provided);
  const expectedDigest = toFixedLengthDigest(expected);

  // Both digests are fixed-length (32 bytes) regardless of input length,
  // so this comparison is always timing-safe and never throws on a
  // length mismatch the way a raw timingSafeEqual(provided, expected)
  // would for differently-sized inputs.
  return timingSafeEqual(providedDigest, expectedDigest);
};

// Testable core: takes the expected key explicitly rather than reading
// env internally, so tests can exercise all three outcomes (unconfigured,
// missing header, wrong key) without mutating global process.env.
export const createRequireMerchantKey = (
  expectedKey: string,
): RequestHandler => (req: Request, res: Response, next: NextFunction): void => {
  if (!expectedKey) {
    // Fail safe: an unconfigured server should not silently accept merchant
    // mutations from anyone. Do not log the (absent) key or any request
    // header values here.
    res.status(503).json({
      success: false,
      message: "Merchant admin access is not configured on this server.",
    });
    return;
  }

  const providedKey = req.header(HEADER_NAME);

  if (!providedKey) {
    res.status(401).json({
      success: false,
      message: "Merchant admin authentication required.",
    });
    return;
  }

  if (!isMatchingMerchantKey(providedKey, expectedKey)) {
    // Generic message on purpose — do not reveal whether the key was
    // simply missing vs. present-but-wrong, and never log the provided
    // value.
    res.status(403).json({
      success: false,
      message: "Merchant admin authentication failed.",
    });
    return;
  }

  next();
};

// Wired instance used by the actual routes (see policy.routes.ts).
export const requireMerchantKey: RequestHandler = (req, res, next) =>
  createRequireMerchantKey(env.MERCHANT_ADMIN_KEY)(req, res, next);
