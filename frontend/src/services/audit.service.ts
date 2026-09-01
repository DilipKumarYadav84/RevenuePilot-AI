import { apiRequest } from "./api-client";
import type { AuditEvent } from "../types/audit";

export const getConversationAudit = (
  conversationId: string,
): Promise<AuditEvent[]> =>
  apiRequest<AuditEvent[]>(
    `/api/dashboard/conversations/${encodeURIComponent(conversationId)}/audit`,
  );
