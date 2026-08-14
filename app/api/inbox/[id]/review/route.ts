import { requireOwnerApi } from "../../../../server/auth";
import { fail, ok, readJson } from "../../../../server/http";
import { reviewInboxItem } from "../../../../server/ingestion";
import type { EvidenceDto } from "../../../../v2-model";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireOwnerApi();
    const { id } = await context.params;
    const body = await readJson<{
      action: "reject" | "ignore" | "convert";
      sourceCategory?: string; credibility?: number; relevance?: number;
      stance?: EvidenceDto["stance"]; note?: string;
    }>(request);
    return ok(await reviewInboxItem(user.userId, user.email, id, body));
  } catch (error) {
    return fail(error);
  }
}
