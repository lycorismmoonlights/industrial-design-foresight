import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  // Cloudflare Cron uses UTC. 16:00 UTC is 00:00 in Asia/Shanghai.
  triggers: { crons: ["0 16 * * *"] },
  vars: {
    ...(process.env.OWNER_EMAIL ? { OWNER_EMAIL: process.env.OWNER_EMAIL } : {}),
    ...(process.env.DEEPSEEK_API_KEY ? { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY } : {}),
    ...(process.env.DEEPSEEK_MODEL ? { DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL } : {}),
    ...(process.env.AI_PROCESSING_ENABLED ? { AI_PROCESSING_ENABLED: process.env.AI_PROCESSING_ENABLED } : {}),
    ...(process.env.AI_DAILY_ITEM_LIMIT ? { AI_DAILY_ITEM_LIMIT: process.env.AI_DAILY_ITEM_LIMIT } : {}),
    ...(process.env.AI_MAX_ATTEMPTS ? { AI_MAX_ATTEMPTS: process.env.AI_MAX_ATTEMPTS } : {}),
    ...(process.env.FRED_API_KEY ? { FRED_API_KEY: process.env.FRED_API_KEY } : {}),
    ...(process.env.BLS_API_KEY ? { BLS_API_KEY: process.env.BLS_API_KEY } : {}),
    ...(process.env.SEC_USER_AGENT ? { SEC_USER_AGENT: process.env.SEC_USER_AGENT } : {}),
    APP_ENV: process.env.APP_ENV ?? "development",
  },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
