import { Router } from "express";

import {
  getDashboardConversationAuditController,
  getDashboardSummaryController,
} from "./dashboard.controller";

const dashboardRouter = Router();

dashboardRouter.get("/summary", getDashboardSummaryController);
dashboardRouter.get(
  "/conversations/:conversationId/audit",
  getDashboardConversationAuditController,
);

export default dashboardRouter;
