import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { validateFixRequest, type FixRequest } from "./fix-schema.js";

/**
 * `POST /v1/fix` — wraps `@pathlight/fix` in an SSE-streamed web endpoint so
 * the dashboard (#49) and CLI alternatives can drive fix-engine runs remotely.
 *
 * Authorization is deferred per parent-invariant #4 in issue #44: any request
 * carrying a well-formed `projectId` is allowed through. A future auth pass
 * will layer on top without changing this route's shape.
 *
 * SSE event schema (stable across T2–T5):
 *   - `progress` — engine phase transitions (`{ kind: "fetching-trace" | ... }`)
 *   - `chunk`    — reserved for streaming LLM output (engine emits whole
 *                  completions today; kept in the wire schema so enabling
 *                  streaming in the engine doesn't require a route change)
 *   - `result`   — final `FixResult` payload (diff, explanation, filesChanged)
 *   - `error`    — sanitized engine failure (never carries keys or stacks)
 *   - `done`     — stream closure sentinel; always fires last
 *
 * T2: scaffolding only. A request with a valid body opens an SSE stream and
 * emits a fixed progress → result → done sequence so the SSE wire contract is
 * testable before the engine is wired in T3.
 */
export function createFixRoutes() {
  const app = new Hono();

  app.post("/", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const validated = validateFixRequest(raw);
    if (!validated.ok) {
      return c.json({ error: validated.error, field: validated.field }, 400);
    }
    const request: FixRequest = validated.value;

    return streamSSE(c, async (stream) => {
      const sendEvent = async (event: string, data: unknown) => {
        if (stream.aborted) return;
        await stream.writeSSE({ event, data: JSON.stringify(data) });
      };

      // T2 scaffold: emit a deterministic progress → result → done sequence.
      // T3 replaces this body with a real fix() call whose progress events
      // pipe through `sendEvent("progress", ...)`.
      await sendEvent("progress", { kind: "accepted", traceId: request.traceId, mode: request.mode });
      await sendEvent("result", {
        diff: "",
        explanation: "fix-engine not yet wired (T2 scaffold)",
        filesChanged: [],
      });
      await sendEvent("done", { ok: true });
    });
  });

  return app;
}
