import { API_BASE_URL } from "../config/api";
import { ApiClientError, type ApiResponse } from "../types/api";

const defaultHeaders = {
  "Content-Type": "application/json",
};

export const apiRequest = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...defaultHeaders,
      ...init.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || !payload?.success) {
    throw new ApiClientError(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Request failed. Please try again.",
      response.status,
    );
  }

  return payload.data;
};
