import { Router } from "express";

import {
  getConversationAuditController,
  queryAuditController,
} from "./audit.controller";

const auditRouter = Router();

auditRouter.get("/", queryAuditController);
auditRouter.get("/conversation/:conversationId", getConversationAuditController);

export default auditRouter;
