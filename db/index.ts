import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

interface AppEnv {
  DB?: D1Database;
  OWNER_EMAIL?: string;
  APP_ENV?: string;
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
