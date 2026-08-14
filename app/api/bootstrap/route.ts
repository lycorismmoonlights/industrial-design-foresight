import { requireOwnerApi } from "../../server/auth";
import { fail, ok } from "../../server/http";
import { bootstrap } from "../../server/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireOwnerApi();
    return ok(await bootstrap(user.userId, {
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
    }));
  } catch (error) {
    return fail(error);
  }
}
