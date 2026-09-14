import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export interface AppEnv {
  DB?: D1Database;
  OWNER_EMAIL?: string;
  APP_ENV?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  AI_PROCESSING_ENABLED?: string;
  AI_DAILY_ITEM_LIMIT?: string;
  AI_MAX_ATTEMPTS?: string;
  FRED_API_KEY?: string;
  BLS_API_KEY?: string;
  SEC_USER_AGENT?: string;
}

export function getDb() {
  const bindings = env as unknown as AppEnv;
  if (!bindings.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(bindings.DB, { schema });
}

export function getD1(): D1Database {
  const bindings = env as unknown as AppEnv;
  if (!bindings.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  return bindings.DB;
}

export function getAppEnv(): AppEnv {
  return env as unknown as AppEnv;
}
