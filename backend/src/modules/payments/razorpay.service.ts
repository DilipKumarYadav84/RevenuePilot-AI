import { createHmac, timingSafeEqual } from "node:crypto";

import Razorpay from "razorpay";
import type { Orders } from "razorpay/dist/types/orders";

import { env, isDevelopment, isProd } from "../../config/env";

export type RazorpayOrder = Pick<
  Orders.RazorpayOrder,
  "id" | "amount" | "currency" | "receipt" | "status"
>;

export type RazorpayOrderClient = {
  orders: {
    create: (
      params: Orders.RazorpayOrderCreateRequestBody,
    ) => Promise<Orders.RazorpayOrder>;
  };
};

export class RazorpayServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

const maskRazorpaySecrets = (message: string): string =>
  message
    .replace(/rzp_(test|live)_[A-Za-z0-9]+/g, "rzp_$1_[redacted]")
    .replace(/key_secret['":=\s]+[A-Za-z0-9_\-]+/gi, "key_secret=[redacted]")
    .replace(/authorization['":=\s]+(?:basic|bearer)?\s*[A-Za-z0-9+/=._:-]+/gi, "authorization=[redacted]")
    .replace(/razorpay_signature['":=\s]+[A-Za-z0-9_\-]+/gi, "razorpay_signature=[redacted]")
    .replace(/[A-Fa-f0-9]{64}/g, "[redacted-signature]");

export type SafeRazorpayErrorDetails = {
  statusCode?: number;
  code?: string;
  description?: string;
  reason?: string;
  source?: string;
  step?: string;
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const toSafeString = (value: unknown): string | undefined => {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const sanitized = maskRazorpaySecrets(String(value)).trim();
  return sanitized.length > 0 ? sanitized : undefined;
};

const toSafeStatusCode = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) ? value : undefined;

export const extractSafeRazorpayErrorDetails = (
  error: unknown,
): SafeRazorpayErrorDetails => {
  const details: SafeRazorpayErrorDetails = {};

  if (isRecord(error)) {
    const normalizedStatusCode = toSafeStatusCode(error.statusCode);

    if (normalizedStatusCode !== undefined) {
      details.statusCode = normalizedStatusCode;
    }

    const sdkError = isRecord(error.error) ? error.error : undefined;
    const axiosResponse = isRecord(error.response) ? error.response : undefined;
    const axiosErrorData = isRecord(axiosResponse?.data)
      ? axiosResponse.data
      : undefined;
    const nestedAxiosError = isRecord(axiosErrorData?.error)
      ? axiosErrorData.error
      : undefined;
    const sourceError = sdkError ?? nestedAxiosError;

    const axiosStatusCode = toSafeStatusCode(axiosResponse?.status);

    if (details.statusCode === undefined && axiosStatusCode !== undefined) {
      details.statusCode = axiosStatusCode;
    }

    if (sourceError) {
      const code = toSafeString(sourceError.code);
      const description = toSafeString(sourceError.description);
      const reason = toSafeString(sourceError.reason);
      const source = toSafeString(sourceError.source);
      const step = toSafeString(sourceError.step);

      if (code !== undefined) {
        details.code = code;
      }

      if (description !== undefined) {
        details.description = description;
      }

      if (reason !== undefined) {
        details.reason = reason;
      }

      if (source !== undefined) {
        details.source = source;
      }

      if (step !== undefined) {
        details.step = step;
      }
    }
  }

  if (!details.description && error instanceof Error) {
    const description = toSafeString(error.message);

    if (description !== undefined) {
      details.description = description;
    }
  }

  return details;
};

export const formatRazorpayErrorDiagnostics = (
  details: SafeRazorpayErrorDetails,
): string => {
  const lines = ["Razorpay order creation failed:"];

  if (details.statusCode !== undefined) {
    lines.push(`statusCode: ${details.statusCode}`);
  }

  if (details.code) {
    lines.push(`code: ${details.code}`);
  }

  if (details.description) {
    lines.push(`description: ${details.description}`);
  }

  lines.push(`reason: ${details.reason ?? "NA"}`);

  if (details.source) {
    lines.push(`source: ${details.source}`);
  }

  if (details.step) {
    lines.push(`step: ${details.step}`);
  }

  return lines.join("\n");
};

const buildRazorpayOrderErrorMessage = (
  details: SafeRazorpayErrorDetails,
): string => {
  if (isProd) {
    return "Razorpay order creation failed.";
  }

  const codePrefix = details.code ? `${details.code}: ` : "";

  return details.description
    ? `Razorpay order creation failed. ${codePrefix}${details.description}`
    : "Razorpay order creation failed.";
};

export const assertRazorpayConfigured = (): void => {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new RazorpayServiceError(
      "Razorpay test credentials are not configured.",
      503,
    );
  }
};

export const getRazorpayKeyId = (): string => {
  assertRazorpayConfigured();
  return env.RAZORPAY_KEY_ID;
};

export const getRazorpayClient = (): RazorpayOrderClient => {
  assertRazorpayConfigured();

  return new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
};

export const createRazorpayOrder = async (
  input: {
    amount: number;
    currency: "INR";
    receipt: string;
    notes?: Record<string, string | number>;
  },
  client: RazorpayOrderClient = getRazorpayClient(),
): Promise<RazorpayOrder> => {
  try {
    const orderInput: Orders.RazorpayOrderCreateRequestBody = {
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
    };

    if (input.notes) {
      orderInput.notes = input.notes;
    }

    return await client.orders.create(orderInput);
  } catch (error) {
    const details = extractSafeRazorpayErrorDetails(error);

    if (isDevelopment) {
      console.error(formatRazorpayErrorDiagnostics(details));
    }

    throw new RazorpayServiceError(buildRazorpayOrderErrorMessage(details), 502);
  }
};

export const buildRazorpayVerificationPayload = (
  razorpayOrderId: string,
  razorpayPaymentId: string,
): string => `${razorpayOrderId}|${razorpayPaymentId}`;

export const signRazorpayPayload = (
  payload: string,
  keySecret: string,
): string => createHmac("sha256", keySecret).update(payload).digest("hex");

export const verifyRazorpaySignature = (input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  keySecret: string;
}): boolean => {
  const expectedSignature = signRazorpayPayload(
    buildRazorpayVerificationPayload(
      input.razorpayOrderId,
      input.razorpayPaymentId,
    ),
    input.keySecret,
  );
  const expected = Buffer.from(expectedSignature, "hex");
  const received = Buffer.from(input.razorpaySignature, "hex");

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
};

export const verifyRazorpayPaymentSignature = (input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean => {
  assertRazorpayConfigured();

  return verifyRazorpaySignature({
    ...input,
    keySecret: env.RAZORPAY_KEY_SECRET,
  });
};
