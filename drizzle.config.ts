import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// load .env if it's there so DIRECT_URL is available for migrate/push.
// generate needs no database, so a missing .env must not crash us.
config();

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // direct connection (port 5432) for migrations only. runtime uses the
    // pooled url in lib/db/client.ts. empty is fine for `generate`.
    url: process.env.DIRECT_URL ?? "",
  },
  strict: true,
  verbose: true,
});
