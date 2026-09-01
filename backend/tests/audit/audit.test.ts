import assert from "node:assert/strict";
import test from "node:test";

import {
  auditActorSchema,
  auditEventTypeSchema,
  auditQuerySchema,
} from "../../src/modules/audit/audit.validation";
import {
  policyDecisionToAuditEventType,
  sortAuditEventsChronologically,
  summarizeContent,
} from "../../src/modules/audit/audit.service";
import type { AuditEvent } from "../../src/modules/audit/audit.types";

test("conversation creation audit event type is supported", () => {
  assert.equal(auditEventTypeSchema.parse("CONVERSATION_STARTED"), "CONVERSATION_STARTED");
});

test("customer message actor is supported", () => {
  assert.equal(auditActorSchema.parse("customer"), "customer");
});

test("intent processing audit event type is supported", () => {
  assert.equal(auditEventTypeSchema.parse("INTENT_DETECTED"), "INTENT_DETECTED");
});

test("catalog search audit event type is supported", () => {
  assert.equal(auditEventTypeSchema.parse("CATALOG_SEARCHED"), "CATALOG_SEARCHED");
});

test("product recommendation audit event type is supported", () => {
  assert.equal(auditEventTypeSchema.parse("PRODUCT_RECOMMENDED"), "PRODUCT_RECOMMENDED");
});

test("action proposal audit event type is supported", () => {
  assert.equal(auditEventTypeSchema.parse("ACTION_PROPOSED"), "ACTION_PROPOSED");
});

test("15% to 10% policy decision maps to POLICY_MODIFIED", () => {
  assert.equal(policyDecisionToAuditEventType("MODIFIED"), "POLICY_MODIFIED");
});

test("blocked policy decision maps to POLICY_BLOCKED", () => {
  assert.equal(policyDecisionToAuditEventType("BLOCKED"), "POLICY_BLOCKED");
});

test("audit query timeline sorts chronologically", () => {
  const later = new Date("2026-08-28T10:00:02.000Z");
  const earlier = new Date("2026-08-28T10:00:01.000Z");
  const events: AuditEvent[] = [
    {
      conversationId: "507f1f77bcf86cd799439011",
      eventType: "POLICY_MODIFIED",
      actor: "policy_engine",
      summary: "Policy modified.",
      createdAt: later,
    },
    {
      conversationId: "507f1f77bcf86cd799439011",
      eventType: "CUSTOMER_MESSAGE_RECEIVED",
      actor: "customer",
      summary: "Customer message.",
      createdAt: earlier,
    },
  ];

  const sorted = sortAuditEventsChronologically(events);

  assert.equal(sorted[0]?.eventType, "CUSTOMER_MESSAGE_RECEIVED");
  assert.equal(sorted[1]?.eventType, "POLICY_MODIFIED");
});

test("simple read filters validate without implying a new audit event", () => {
  const parsed = auditQuerySchema.parse({
    actor: "customer",
    eventType: "CUSTOMER_MESSAGE_RECEIVED",
    limit: "10",
    page: "1",
  });

  assert.equal(parsed.actor, "customer");
  assert.equal(parsed.eventType, "CUSTOMER_MESSAGE_RECEIVED");
  assert.equal(parsed.limit, 10);
});

test("audit summaries are concise", () => {
  const summary = summarizeContent("x".repeat(300));

  assert.equal(summary.length, 240);
  assert.ok(summary.endsWith("..."));
});
