import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const requireEnv = (key: string): string => {
  const value = process.env[key];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value.trim();
};

const parsePort = (value: string | undefined): number => {
  const fallbackPort = 5000;

  if (!value) {
    return fallbackPort;
  }

  const parsedPort = Number(value);

  if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
    throw new Error("PORT must be a valid TCP port number");
  }

  return parsedPort;
};

export const env = {
  NODE_ENV: process.env.NODE_ENV?.trim() || "development",
  PORT: parsePort(process.env.PORT),
  MONGODB_URI: requireEnv("MONGODB_URI"),
  FRONTEND_URL:
    process.env.FRONTEND_URL?.trim() ||
    (isProduction ? requireEnv("FRONTEND_URL") : "http://localhost:5173"),
  AI_PROVIDER: process.env.AI_PROVIDER?.trim() || "local",
  AI_API_KEY: process.env.AI_API_KEY?.trim() || "",
  AI_MODEL: process.env.AI_MODEL?.trim() || "local-rules-v1",
  AI_STRUCTURED_MODEL: process.env.AI_STRUCTURED_MODEL?.trim() || "",
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID?.trim() || "",
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET?.trim() || "",
  // Buildathon-safe merchant/admin protection for sensitive mutation routes
  // (e.g. PATCH /api/policies). Not a production auth system — see
  // middleware/merchantAuth.middleware.ts for the chosen approach.
  MERCHANT_ADMIN_KEY: process.env.MERCHANT_ADMIN_KEY?.trim() || "",
} as const;

export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
export const isProd = env.NODE_ENV === "production";
