import { requireOwnerApi } from "../../server/auth";
import { createSource, listSources, updateSource } from "../../server/ingestion";
import { AppError, assertString, fail, ok, readJson } from "../../server/http";
import type { SourceDto } from "../../v2-model";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireOwnerApi();
    return ok(await listSources(user.userId));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireOwnerApi();
    const body = await readJson<{
      name?: string; pageUrl?: string | null; feedUrl?: string | null;
      sourceType?: SourceDto["sourceType"]; sourceCategory?: string;
      defaultCredibility?: number; enabled?: boolean; confirmEnable?: boolean;
    }>(request);
    return ok(await createSource(user.userId, {
      ...body,
      name: assertString(body.name, "来源名称"),
    }), 201);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireOwnerApi();
    const body = await readJson<{
      id?: string;
      patch?: { name?: string; pageUrl?: string | null; feedUrl?: string | null; sourceCategory?: string; defaultCredibility?: number; enabled?: boolean };
      confirmEnable?: boolean;
    }>(request);
    if (!body.patch || typeof body.patch !== "object") throw new AppError(400, "PATCH_REQUIRED", "缺少来源更新内容。");
    return ok(await updateSource(user.userId, assertString(body.id, "来源 ID"), { ...body.patch, confirmEnable: body.confirmEnable }));
  } catch (error) {
    return fail(error);
  }
}
