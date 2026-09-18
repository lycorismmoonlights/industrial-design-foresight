import { requireOwnerApi } from "../../../server/auth";
import { AppError, fail, ok } from "../../../server/http";
import { importV2 } from "../../../server/repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireOwnerApi();
    const rawBody = await request.text();
    if (rawBody.length > 10 * 1024 * 1024) throw new AppError(413, "IMPORT_TOO_LARGE", "v2 备份文件不能超过 10 MB。");
    return ok(await importV2(user.userId, rawBody), 201);
  } catch (error) {
    return fail(error);
  }
}
