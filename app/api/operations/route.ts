import { requireOwnerApi } from "../../server/auth";
import { fail, ok } from "../../server/http";
import { getOperationsOverview } from "../../server/operations";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireOwnerApi();
    return ok(await getOperationsOverview(user.userId));
  } catch (error) {
    return fail(error);
  }
}
