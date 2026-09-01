import type { ErrorRequestHandler } from "express";

import { isProd } from "../config/env";

type ErrorResponse = {
  success: false;
  message: string;
  stack?: string;
};

const sanitizeErrorMessage = (message: string): string =>
  message.replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, "mongodb://[redacted]");

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const statusCode =
    typeof err.statusCode === "number" && err.statusCode >= 400
      ? err.statusCode
      : 500;

  const message =
    statusCode === 500 && isProd
      ? "Internal server error"
      : sanitizeErrorMessage(err.message || "Internal server error");

  const response: ErrorResponse = {
    success: false,
    message,
  };

  if (!isProd && err.stack) {
    response.stack = sanitizeErrorMessage(err.stack);
  }

  res.status(statusCode).json(response);
};
