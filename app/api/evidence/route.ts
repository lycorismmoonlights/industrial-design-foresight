import { requireOwnerApi } from "../../server/auth";
import { createEvidence, updateEvidence } from "../../server/ingestion";
import { assertString, fail, ok, readJson } from "../../server/http";
import type { EvidenceDto } from "../../v2-model";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireOwnerApi();
    const body = await readJson<{
      title?: string; url?: string | null; sourceName?: string; sourceCategory?: string;
      credibility?: number; relevance?: number; stance?: EvidenceDto["stance"];
      note?: string; publishedAt?: string | null; recordId?: string | null;
    }>(request);
    return ok(await createEvidence(user.userId, {
      ...body,
      title: assertString(body.title, "证据标题"),
      sourceName: assertString(body.sourceName, "来源名称"),
      sourceCategory: assertString(body.sourceCategory, "来源类别"),
      credibility: Number(body.credibility),
      relevance: Number(body.relevance),
      stance: body.stance ?? "context",
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
      patch?: Partial<{ title: string; url: string | null; sourceName: string; sourceCategory: string; credibility: number; relevance: number; stance: EvidenceDto["stance"]; note: string; publishedAt: string | null }>;
    }>(request);
    return ok(await updateEvidence(user.userId, assertString(body.id, "证据 ID"), body.patch ?? {}));
  } catch (error) {
    return fail(error);
  }
}
