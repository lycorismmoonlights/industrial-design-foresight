import type { ApiResponse } from "../v2-model";

export class ApiClientError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number, public readonly details?: unknown) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body === undefined || typeof init.body === "string" ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json() as ApiResponse<T>;
  if (!body.ok) throw new ApiClientError(body.error.code, body.error.message, response.status, body.error.details);
  return body.data;
}
