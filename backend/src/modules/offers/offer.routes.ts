import { Router } from "express";

import {
  acceptOfferController,
  createOfferController,
  getConversationOffersController,
  getOfferController,
  rejectOfferController,
} from "./offer.controller";

const offerRouter = Router();

offerRouter.post("/", createOfferController);
offerRouter.get("/conversation/:conversationId", getConversationOffersController);
offerRouter.post("/:id/accept", acceptOfferController);
offerRouter.post("/:id/reject", rejectOfferController);
offerRouter.get("/:id", getOfferController);

export default offerRouter;
