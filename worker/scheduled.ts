import { fetchAllEnabledSources } from "../app/server/ingestion";

export function scheduleSourceIngestion(context: { waitUntil(promise: Promise<unknown>): void }): void {
  context.waitUntil(fetchAllEnabledSources());
}
