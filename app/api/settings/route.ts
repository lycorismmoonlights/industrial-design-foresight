import { requireOwnerApi } from "../../server/auth";
import { fail, ok, readJson } from "../../server/http";
import { updateSettings } from "../../server/repository";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const user = await requireOwnerApi();
    const patch = await readJson<Record<string, unknown>>(request);
    return ok(await updateSettings(user.userId, patch));
  } catch (error) {
    return fail(error);
  }
}
