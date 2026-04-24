import { Hono } from "hono";
import { validateFixRequest } from "./fix-schema.js";

/**
 * `POST /v1/fix` — wraps `@pathlight/fix` in an SSE-streamed web endpoint so
 * the dashboard (#49) and CLI alternatives can drive fix-engine runs remotely.
 *
 * Authorization is deferred per parent-invariant #4 in issue #44: any request
 * carrying a well-formed `projectId` is allowed through. A future auth pass
 * will layer on top without changing this route's shape.
 *
 * T1: validation only. T2 adds SSE scaffolding, T3 wires the engine, T4 adds
 * secret resolution, T5 adds error handling + observability.
 */
export function createFixRoutes() {
  const app = new Hono();

  app.post("/", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const result = validateFixRequest(raw);
    if (!result.ok) {
      return c.json({ error: result.error, field: result.field }, 400);
    }

    // TODO(T2): open SSE stream and hand off to the fix-engine.
    return c.json({ ok: true, accepted: true });
  });

  return app;
}
