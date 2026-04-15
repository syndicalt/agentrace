import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import { serve } from "@hono/node-server";
import { createDb, runMigrations } from "@agentrace/db";
import { createRouter } from "./router.js";

const port = parseInt(process.env.PORT || "4100", 10);

const db = createDb();
await runMigrations(db);

console.log(`Agentrace collector running on http://localhost:${port}`);

const app = await createRouter({ db });
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
