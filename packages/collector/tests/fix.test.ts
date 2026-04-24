import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { createFixRoutes } from "../src/routes/fix.js";
import type {
  FixOptions,
  FixResult,
  FixProgress,
} from "@pathlight/fix";

/**
 * Integration tests for `POST /v1/fix`. We mount the route on a minimal Hono
 * app so we can inject a stub engine and a stub secret resolver — no need to
 * boot the full collector (DB, OTLP, etc.) for route-level assertions.
 */

interface SseMessage {
  event: string;
  data: unknown;
}

async function readSse(response: Response): Promise<SseMessage[]> {
  const text = await response.text();
  const messages: SseMessage[] = [];
  for (const block of text.split(/\n\n+/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    let event: string | undefined;
    let data: string | undefined;
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data = (data ?? "") + line.slice(5).trim();
    }
    if (event && data !== undefined) {
      let parsed: unknown = data;
      try {
        parsed = JSON.parse(data);
      } catch {
        // leave as raw string
      }
      messages.push({ event, data: parsed });
    }
  }
  return messages;
}

function buildApp(options: {
  runFix?: (o: FixOptions) => Promise<FixResult>;
  llmKey?: string | null;
  gitToken?: string | null;
}) {
  const app = new Hono();
  app.route(
    "/v1/fix",
    createFixRoutes({
      runFix: options.runFix,
      secretResolver: {
        async resolveLlmKey() {
          return options.llmKey ?? null;
        },
        async resolveGitToken() {
          return options.gitToken ?? null;
        },
      },
      // Silence default console logging during tests.
      logger: { error: () => {}, warn: () => {} },
    }),
  );
  return app;
}

const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const validBody = {
  traceId: "trace-123",
  projectId: "proj-abc",
  source: { kind: "path", dir: "/tmp/example" },
  llm: { provider: "anthropic", keyId: "k1" },
  mode: "span",
};

describe("POST /v1/fix", () => {
  it("400 on missing required fields", async () => {
    const app = buildApp({ llmKey: "fake-key" });
    const res = await app.fetch(new Request("http://test/v1/fix", jsonPost({})));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ field: expect.any(String), error: expect.any(String) });
  });

  it("400 when bisect mode is missing from/to", async () => {
    const app = buildApp({ llmKey: "fake-key" });
    const res = await app.fetch(
      new Request(
        "http://test/v1/fix",
        jsonPost({ ...validBody, mode: "bisect" }),
      ),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { field: string };
    expect(body.field).toMatch(/^(from|to)$/);
  });

  it("400 when source.kind is unknown", async () => {
    const app = buildApp({ llmKey: "fake-key" });
    const res = await app.fetch(
      new Request(
        "http://test/v1/fix",
        jsonPost({ ...validBody, source: { kind: "ftp", dir: "/x" } }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("streams progress → result → done for a successful fix", async () => {
    const progressEvents: FixProgress[] = [
      { kind: "fetching-trace" },
      { kind: "reading-source", fileCount: 2 },
      { kind: "calling-llm", provider: "anthropic", model: "claude-opus-4-7" },
      { kind: "parsing-diff" },
    ];
    const runFix = async (opts: FixOptions): Promise<FixResult> => {
      for (const ev of progressEvents) opts.onProgress?.(ev);
      return {
        diff: "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n",
        explanation: "flipped the sign",
        filesChanged: ["x"],
        metaTraceId: "meta-1",
      };
    };

    const app = buildApp({ runFix, llmKey: "fake-key" });
    const res = await app.fetch(new Request("http://test/v1/fix", jsonPost(validBody)));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/event-stream");

    const messages = await readSse(res);
    const events = messages.map((m) => m.event);
    expect(events).toEqual([
      "progress",
      "progress",
      "progress",
      "progress",
      "result",
      "done",
    ]);

    const progress = messages.filter((m) => m.event === "progress").map((m) => m.data);
    expect(progress).toEqual(progressEvents);

    const result = messages.find((m) => m.event === "result")?.data as FixResult;
    expect(result.diff).toContain("+new");
    expect(result.filesChanged).toEqual(["x"]);
    expect(result.metaTraceId).toBe("meta-1");

    const done = messages.find((m) => m.event === "done")?.data as { ok: boolean };
    expect(done.ok).toBe(true);
  });

  it("emits a sanitized error event when the engine throws", async () => {
    const apiKey = "sk-ant-absolutely-secret";
    const runFix = async () => {
      throw new Error(`upstream 401: bad key ${apiKey}`);
    };
    const app = buildApp({ runFix, llmKey: apiKey });

    const res = await app.fetch(new Request("http://test/v1/fix", jsonPost(validBody)));
    expect(res.status).toBe(200);
    const messages = await readSse(res);
    const error = messages.find((m) => m.event === "error")?.data as { message: string };
    expect(error).toBeDefined();
    expect(error.message).toBe("fix-engine failed");
    // The SSE error payload must not include the API key, the error's own
    // message, or a stack.
    const wireText = JSON.stringify(messages);
    expect(wireText).not.toContain(apiKey);
    expect(wireText).not.toContain("upstream 401");

    const done = messages.find((m) => m.event === "done")?.data as { ok: boolean };
    expect(done.ok).toBe(false);
  });

  it("emits sanitized error when the LLM key cannot be resolved", async () => {
    const app = buildApp({ llmKey: null });
    const res = await app.fetch(new Request("http://test/v1/fix", jsonPost(validBody)));
    const messages = await readSse(res);
    const error = messages.find((m) => m.event === "error")?.data as { message: string };
    expect(error.message).toBe("secret resolution failed");
    const done = messages.find((m) => m.event === "done")?.data as { ok: boolean };
    expect(done.ok).toBe(false);
  });

  it("emits sanitized error when a git token cannot be resolved", async () => {
    const app = buildApp({ llmKey: "fake-key", gitToken: null });
    const gitBody = {
      ...validBody,
      source: { kind: "git", repoUrl: "https://example.com/r.git", tokenId: "t1" },
    };
    const res = await app.fetch(new Request("http://test/v1/fix", jsonPost(gitBody)));
    const messages = await readSse(res);
    const error = messages.find((m) => m.event === "error")?.data as { message: string };
    expect(error.message).toBe("secret resolution failed");
  });

  it("passes resolved secrets into the engine without echoing them", async () => {
    const apiKey = "sk-test-ZZZ";
    let capturedApiKey: string | undefined;
    const runFix = async (opts: FixOptions): Promise<FixResult> => {
      capturedApiKey = opts.llm.apiKey;
      return { diff: "", explanation: "ok", filesChanged: [] };
    };

    const app = buildApp({ runFix, llmKey: apiKey });
    const res = await app.fetch(new Request("http://test/v1/fix", jsonPost(validBody)));
    const messages = await readSse(res);

    expect(capturedApiKey).toBe(apiKey);
    // But the resolved key should never appear on the wire.
    const wireText = JSON.stringify(messages);
    expect(wireText).not.toContain(apiKey);
  });
});
