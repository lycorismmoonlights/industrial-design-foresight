import { requireOwnerApi } from "../../../../server/auth";
import { fail, ok } from "../../../../server/http";
import { fetchSource } from "../../../../server/ingestion";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireOwnerApi();
    const { id } = await context.params;
    return ok(await fetchSource(user.userId, id));
  } catch (error) {
    return fail(error);
  }
}
