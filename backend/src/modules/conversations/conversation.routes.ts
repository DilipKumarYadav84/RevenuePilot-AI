import { Router } from "express";

import {
  appendConversationMessageController,
  createConversationController,
  getConversationController,
  processConversationController,
} from "./conversation.controller";

const conversationRouter = Router();

conversationRouter.post("/", createConversationController);
conversationRouter.post("/:id/process", processConversationController);
conversationRouter.get("/:id", getConversationController);
conversationRouter.post("/:id/messages", appendConversationMessageController);

export default conversationRouter;
