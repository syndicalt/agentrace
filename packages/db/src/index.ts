import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export * from "./schema.js";
export { eq, and, or, desc, asc, sql, gte, lte, like, inArray } from "drizzle-orm";

export type Db = ReturnType<typeof drizzle>;

export function createDb(url?: string, authToken?: string) {
  const client = createClient({
    url: url || process.env.DATABASE_URL || "file:tracelens.db",
    authToken: authToken || process.env.DATABASE_AUTH_TOKEN,
  });
  return drizzle(client);
}

export async function runMigrations(db: Db) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  await migrate(db, { migrationsFolder: resolve(__dirname, "../drizzle") });
}
