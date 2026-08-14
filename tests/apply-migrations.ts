import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

interface TestEnv {
  DB: D1Database;
  TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
}

const testEnv = env as unknown as TestEnv;
await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
