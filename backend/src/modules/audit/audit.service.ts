import { AuditEventModel } from "./audit.model";
import type {
  AuditEvent,
  AuditActor,
  AuditEventFilter,
  AuditEventType,
  CreateAuditEventInput,
} from "./audit.types";
import type { PolicyDecision } from "../policies/policy.types";

const MAX_SUMMARY_LENGTH = 240;

type AuditQuery = {
  conversationId?: string;
  eventType?: AuditEventType;
  actor?: AuditActor;
};

type MongoDuplicateKeyError = {
  code?: number;
};

const isDuplicateKeyError = (error: unknown): error is MongoDuplicateKeyError =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as MongoDuplicateKeyError).code === 11000;

export const summarizeContent = (content: string): string => {
  const compact = content.replace(/\s+/g, " ").trim();

  if (compact.length <= MAX_SUMMARY_LENGTH) {
    return compact;
  }

  return `${compact.slice(0, MAX_SUMMARY_LENGTH - 3)}...`;
};

export const policyDecisionToAuditEventType = (
  decision: PolicyDecision["decision"],
): AuditEventType => {
  switch (decision) {
    case "APPROVED":
      return "POLICY_APPROVED";
    case "MODIFIED":
      return "POLICY_MODIFIED";
    case "BLOCKED":
      return "POLICY_BLOCKED";
    case "REQUIRES_APPROVAL":
      return "POLICY_REQUIRES_APPROVAL";
  }
};

export const sortAuditEventsChronologically = (
  events: AuditEvent[],
): AuditEvent[] =>
  [...events].sort((first, second) => {
    const firstTime = first.createdAt?.getTime() ?? 0;
    const secondTime = second.createdAt?.getTime() ?? 0;

    return firstTime - secondTime;
  });

export const createAuditEvent = async (
  input: CreateAuditEventInput,
): Promise<AuditEvent | null> => {
  try {
    const event = await AuditEventModel.create(input);
    return event.toObject();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return null;
    }

    throw error;
  }
};

export const getAuditEventsForConversation = async (
  conversationId: string,
): Promise<AuditEvent[]> => {
  const events = await AuditEventModel.find({ conversationId })
    .sort({ createdAt: 1, _id: 1 })
    .lean<AuditEvent[]>()
    .exec();

  return sortAuditEventsChronologically(events);
};

export type MatchingActionProposalQuery = {
  conversationId: string;
  action: "CREATE_DISCOUNT" | "START_CHECKOUT";
  productId: string;
  requestedDiscountPercent?: number;
};

/**
 * Pure predicate for the offer-creation provenance check (see
 * offer.service.ts). Kept as a standalone, DB-free function — the single
 * source of truth for what counts as "a matching proposal" — so it is
 * directly unit-testable without a database, and is reused as-is by
 * findMatchingActionProposalEvent below.
 */
export const isMatchingActionProposalEvent = (
  event: Pick<AuditEvent, "eventType" | "output">,
  query: MatchingActionProposalQuery,
): boolean => {
  if (event.eventType !== "ACTION_PROPOSED") {
    return false;
  }

  const output = event.output;

  return (
    output?.action === query.action &&
    output?.productId === query.productId &&
    (query.action === "START_CHECKOUT" ||
      output?.requestedDiscountPercent === query.requestedDiscountPercent)
  );
};

/**
 * Provenance check for offer creation (see offer.service.ts): finds the
 * most recent ACTION_PROPOSED audit event for this conversation whose
 * recorded output matches the action, product, and discount percent being
 * requested. This proves a real conversation turn actually produced this
 * proposal (via the deterministic policy-proposal step) rather than a
 * client fabricating a discount request out of thin air.
 *
 * This is provenance evidence only, not financial authority — callers
 * must still re-run the Policy Engine and reload the product price from
 * MongoDB before creating anything payable.
 */
export const findMatchingActionProposalEvent = async (
  query: MatchingActionProposalQuery,
): Promise<AuditEvent | null> => {
  const candidates = await AuditEventModel.find({
    conversationId: query.conversationId,
    eventType: "ACTION_PROPOSED",
  })
    .sort({ createdAt: -1 })
    .lean<AuditEvent[]>()
    .exec();

  return candidates.find((event) => isMatchingActionProposalEvent(event, query)) ?? null;
};

export const queryAuditEvents = async (
  filters: AuditEventFilter,
): Promise<AuditEvent[]> => {
  const query: AuditQuery = {};
  const limit = filters.limit ?? 50;
  const page = filters.page ?? 1;

  if (filters.conversationId) {
    query.conversationId = filters.conversationId;
  }

  if (filters.eventType) {
    query.eventType = filters.eventType;
  }

  if (filters.actor) {
    query.actor = filters.actor;
  }

  const events = await AuditEventModel.find(query)
    .sort({ createdAt: 1, _id: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean<AuditEvent[]>()
    .exec();

  return sortAuditEventsChronologically(events);
};
