import { runDailyResearchPipeline } from "../../../server/daily-pipeline";
import { requireOwnerApi } from "../../../server/auth";
import { fail, ok } from "../../../server/http";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireOwnerApi();
    return ok(await runDailyResearchPipeline({
      scheduledFor: new Date(),
      triggerType: "manual",
      requestedBy: user.email,
    }));
  } catch (error) {
    return fail(error);
  }
}
