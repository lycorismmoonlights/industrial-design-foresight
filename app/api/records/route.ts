import { requireOwnerApi } from "../../server/auth";
import { AppError, assertString, fail, ok, readJson } from "../../server/http";
import { createRecord, listRevisions, softDeleteRecord, updateRecord } from "../../server/repository";
import type { RecordKind, RecordStatus } from "../../v2-model";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireOwnerApi();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new AppError(400, "RECORD_ID_REQUIRED", "缺少记录 ID。");
    return ok(await listRevisions(user.userId, id));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireOwnerApi();
    const body = await readJson<{
      kind?: RecordKind; status?: RecordStatus; title?: string; summary?: string;
      payload?: Record<string, unknown>; changeReason?: string;
    }>(request);
    if (!body.kind) throw new AppError(400, "RECORD_KIND_REQUIRED", "缺少记录类型。");
    return ok(await createRecord(user.userId, user.email, {
      kind: body.kind,
      status: body.status,
      title: assertString(body.title, "标题"),
      summary: body.summary,
      payload: body.payload,
      changeReason: body.changeReason,
    }), 201);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireOwnerApi();
    const body = await readJson<{
      id?: string; expectedRevision?: number; restore?: boolean; changeReason?: string;
      patch?: { status?: RecordStatus; title?: string; summary?: string; payload?: Record<string, unknown> };
    }>(request);
    const id = assertString(body.id, "记录 ID");
    if (!Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 1) {
      throw new AppError(400, "EXPECTED_REVISION_REQUIRED", "expectedRevision 必须是正整数。");
    }
    if (body.restore) {
      return ok(await softDeleteRecord(user.userId, user.email, id, Number(body.expectedRevision), true, body.changeReason));
    }
    if (!body.patch || typeof body.patch !== "object") throw new AppError(400, "PATCH_REQUIRED", "缺少更新内容。");
    return ok(await updateRecord(user.userId, user.email, id, Number(body.expectedRevision), body.patch, body.changeReason));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireOwnerApi();
    const body = await readJson<{ id?: string; expectedRevision?: number; changeReason?: string }>(request);
    const id = assertString(body.id, "记录 ID");
    if (!Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 1) {
      throw new AppError(400, "EXPECTED_REVISION_REQUIRED", "expectedRevision 必须是正整数。");
    }
    return ok(await softDeleteRecord(user.userId, user.email, id, Number(body.expectedRevision), false, body.changeReason));
  } catch (error) {
    return fail(error);
  }
}
