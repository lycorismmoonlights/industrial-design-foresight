import { requireOwnerApi } from "../../../server/auth";
import { AppError, fail, ok, readJson } from "../../../server/http";
import { listOperationsInbox, retryFailedAiItems } from "../../../server/operations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireOwnerApi();
    return ok(await listOperationsInbox(user.userId, new URL(request.url).searchParams));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireOwnerApi();
    const body = await readJson<{ action?: string; ids?: unknown }>(request);
    if (body.action !== "retry_ai") throw new AppError(400, "INVALID_INBOX_OPERATION", "未知数据操作。");
    return ok(await retryFailedAiItems(user.userId, body.ids));
  } catch (error) {
    return fail(error);
  }
}
