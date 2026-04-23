import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.OC_KITCHEN_DB_PATH || "./kitchen.db",
  },
});
