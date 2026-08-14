import { requireOwnerApi } from "../../server/auth";
import { fail, ok } from "../../server/http";
import { exportAll } from "../../server/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireOwnerApi();
    return ok(await exportAll(user.userId));
  } catch (error) {
    return fail(error);
  }
}
