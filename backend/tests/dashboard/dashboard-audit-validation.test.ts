import assert from "node:assert/strict";
import test from "node:test";

import { mongoIdSchema } from "../../src/modules/audit/audit.validation";

// dashboard.controller.ts's getDashboardConversationAuditController now
// validates req.params.conversationId with this exact schema (the same
// one already used by the audit module) before it ever reaches Mongoose,
// so an invalid id returns a clean 400 instead of an unhandled
// Mongoose CastError.

test("a valid 24-character hex ObjectId string passes", () => {
  const parsed = mongoIdSchema.safeParse("507f1f77bcf86cd799439011");

  assert.equal(parsed.success, true);
});

test("an invalid ObjectId string is rejected", () => {
  const parsed = mongoIdSchema.safeParse("not-a-valid-object-id");

  assert.equal(parsed.success, false);
});

test("an empty string is rejected", () => {
  const parsed = mongoIdSchema.safeParse("");

  assert.equal(parsed.success, false);
});
