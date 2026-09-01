import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env, isProd } from "./config/env";
import { errorHandler } from "./middleware/error.middleware";
import { notFoundHandler } from "./middleware/notFound.middleware";
import auditRouter from "./modules/audit/audit.routes";
import conversationRouter from "./modules/conversations/conversation.routes";
import dashboardRouter from "./modules/dashboard/dashboard.routes";
import offerRouter from "./modules/offers/offer.routes";
import paymentRouter from "./modules/payments/payment.routes";
import policyRouter from "./modules/policies/policy.routes";
import productRouter from "./modules/products/product.routes";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(express.json());
app.use(morgan(isProd ? "combined" : "dev"));

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "RevenuePilot API",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/products", productRouter);
app.use("/api/conversations", conversationRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/policies", policyRouter);
app.use("/api/audit", auditRouter);
app.use("/api/offers", offerRouter);
app.use("/api/payments", paymentRouter);

app.use("/api", notFoundHandler);
app.use(errorHandler);

export default app;
