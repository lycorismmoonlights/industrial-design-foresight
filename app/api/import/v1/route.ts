import { requireOwnerApi } from "../../../server/auth";
import { AppError, fail, ok } from "../../../server/http";
import { importV1 } from "../../../server/repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireOwnerApi();
    const rawBody = await request.text();
    if (rawBody.length > 2 * 1024 * 1024) throw new AppError(413, "IMPORT_TOO_LARGE", "导入文件不能超过 2 MB。");
    return ok(await importV1(user.userId, user.email, rawBody), 201);
  } catch (error) {
    return fail(error);
  }
}
