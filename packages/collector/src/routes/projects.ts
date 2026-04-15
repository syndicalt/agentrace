import { Hono } from "hono";
import type { Db } from "@pathlight/db";
import { projects } from "@pathlight/db";
import { eq } from "@pathlight/db";
import { nanoid } from "nanoid";
import { randomBytes } from "node:crypto";

export function createProjectRoutes(db: Db) {
  const app = new Hono();

  // List projects
  app.get("/", async (c) => {
    const rows = await db.select().from(projects).all();
    return c.json({ projects: rows });
  });

  // Create project
  app.post("/", async (c) => {
    const body = await c.req.json<{ name: string; description?: string }>();

    if (!body.name) {
      return c.json({ error: { message: "name is required", type: "validation_error" } }, 400);
    }

    const id = nanoid();
    const apiKey = `tl_${randomBytes(24).toString("hex")}`;

    await db.insert(projects).values({
      id,
      name: body.name,
      description: body.description || null,
      apiKey,
    }).run();

    return c.json({ id, apiKey }, 201);
  });

  // Delete project
  app.delete("/:id", async (c) => {
    const { id } = c.req.param();
    await db.delete(projects).where(eq(projects.id, id)).run();
    return c.json({ deleted: true });
  });

  return app;
}
