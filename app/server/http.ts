import { NextResponse } from "next/server";
import type { ApiError, ApiResponse } from "../v2-model";
import { AppError } from "./errors";

export { AppError } from "./errors";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json<ApiResponse<T>>({ ok: true, data }, { status });
}

export function fail(error: unknown) {
  const appError = error instanceof AppError
    ? error
    : new AppError(500, "INTERNAL_ERROR", "服务器暂时无法完成请求。");
  const body: ApiError = {
    code: appError.code,
    message: appError.message,
    ...(appError.details === undefined ? {} : { details: appError.details }),
  };
  return NextResponse.json<ApiResponse<never>>({ ok: false, error: body }, { status: appError.status });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new AppError(400, "INVALID_JSON", "请求体必须是有效 JSON。");
  }
}

export function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} 不能为空。`);
  }
  return value.trim();
}
