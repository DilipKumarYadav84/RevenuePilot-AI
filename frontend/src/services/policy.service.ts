import { apiRequest } from "./api-client";
import type { MerchantPolicy, MerchantPolicyUpdate } from "../types/merchant";

export const getPolicy = (): Promise<MerchantPolicy> =>
  apiRequest<MerchantPolicy>("/api/policies");

// merchantKey is a Buildathon-demo-only convenience: it is never read from
// a bundled env var and never persisted (see MerchantConsole.tsx). It is
// typed in by whoever is operating the merchant console for this session
// and sent only on this request. Do NOT treat this as production auth —
// the backend's requireMerchantKey middleware is the real (still
// lightweight) protection; see backend/src/middleware/merchantAuth.middleware.ts.
export const updatePolicy = (
  updates: MerchantPolicyUpdate,
  merchantKey?: string,
): Promise<MerchantPolicy> =>
  apiRequest<MerchantPolicy>("/api/policies", {
    method: "PATCH",
    body: JSON.stringify(updates),
    headers: merchantKey ? { "x-merchant-key": merchantKey } : undefined,
  });
