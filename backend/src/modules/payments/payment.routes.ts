import { Router } from "express";

import {
  createPaymentOrderController,
  getPaymentController,
  verifyPaymentController,
} from "./payment.controller";

const paymentRouter = Router();

paymentRouter.post("/create-order", createPaymentOrderController);
paymentRouter.post("/verify", verifyPaymentController);
paymentRouter.get("/:id", getPaymentController);

export default paymentRouter;
