import { apiRequest } from "./api-client";
import type { DashboardSummary } from "../types/merchant";

export const getDashboardSummary = (): Promise<DashboardSummary> =>
  apiRequest<DashboardSummary>("/api/dashboard/summary");
