import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { fix, type FixOptions, type FixProgress, type Source } from "@pathlight/fix";
import { validateFixRequest, type FixRequest } from "./fix-schema.js";
import {
  createEnvSecretResolver,
  type SecretResolver,
} from "./fix-secret-resolver.js";

/**
 * `POST /v1/fix` — wraps `@pathlight/fix` in an SSE-streamed web endpoint so
 * the dashboard (#49) and CLI alternatives can drive fix-engine runs remotely.
 *
 * Authorization is deferred per parent-invariant #4 in issue #44: any request
 * carrying a well-formed `projectId` is allowed through. A future auth pass
 * will layer on top without changing this route's shape.
 *
 * SSE event schema:
 *   - `progress` — engine phase transitions (`FixProgress` values verbatim)
 *   - `chunk`    — reserved for streaming LLM output (engine emits whole
 *                  completions today; kept in the wire schema so enabling
 *                  streaming in the engine doesn't require a route change)
 *   - `result`   — final `FixResult` payload (diff, explanation, filesChanged)
 *   - `error`    — sanitized engine failure (no keys, no tokens, no stack)
 *   - `done`     — stream closure sentinel; always fires last
 *
 * Meta-trace emission: NOT done here. `@pathlight/fix`'s `fix()` already
 * emits its own meta-trace on every invocation (see parent-invariant #3 in
 * issue #44). Adding a second trace from the route would double-instrument.
 * The engine's `metaTraceId` is echoed on the `result` event so clients can
 * link back to it.
 */

export function createFixRoutes(options?: FixRouteOptions) {
  const app = new Hono();
  const runFix = options?.runFix ?? fix;
  const secretResolver = options?.secretResolver ?? createEnvSecretResolver();
  const resolveSecrets =
    options?.resolveSecrets ?? ((request: FixRequest) => resolveRequestSecrets(request, secretResolver));
  const log = options?.logger ?? defaultLogger;

  app.post("/", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const validated = validateFixRequest(raw);
    if (!validated.ok) {
      return c.json({ error: validated.error, field: validated.field }, 400);
    }
    const request = validated.value;
    const collectorUrl = computeCollectorUrl(c.req.url);

    return streamSSE(c, async (stream) => {
      const sendEvent = async (event: string, data: unknown) => {
        if (stream.aborted) return;
        try {
          await stream.writeSSE({ event, data: JSON.stringify(data) });
        } catch (err) {
          // The stream may have been aborted between the `aborted` check and
          // the write. Log the failure but never re-throw — we're already
          // inside the error-handling path most of the time.
          log.warn("fix-route: failed to write SSE event", {
            event,
            reason: err instanceof Error ? err.name : "unknown",
          });
        }
      };

      const onProgress = (event: FixProgress) => {
        // Fire-and-forget — progress emission must never block the engine.
        void sendEvent("progress", event);
      };

      const failGeneric = async (
        stage: string,
        err: unknown,
        publicMessage: string,
      ) => {
        // Server-side: log the full detail (with secrets redacted) so
        // operators can debug. Client-side: emit only the public message.
        log.error(`fix-route: ${stage}`, {
          projectId: request.projectId,
          traceId: request.traceId,
          mode: request.mode,
          provider: request.llm.provider,
          error: redactErrorForLog(err, secretSet()),
        });
        await sendEvent("error", { message: publicMessage });
        await sendEvent("done", { ok: false });
      };

      // Capture the secret values after resolution so we can redact them
      // from any error detail we log, belt-and-suspenders style. The set is
      // seeded empty and populated once resolution succeeds.
      let resolvedSecrets: ResolvedSecrets | null = null;
      const secretSet = () => collectSecretStrings(resolvedSecrets);

      try {
        resolvedSecrets = await resolveSecrets(request);
      } catch (err) {
        await failGeneric("resolver threw", err, "secret resolution failed");
        return;
      }
      if (!resolvedSecrets.llmApiKey) {
        await failGeneric("resolver returned null llmApiKey", null, "secret resolution failed");
        return;
      }
      if (request.source.kind === "git" && !resolvedSecrets.gitToken) {
        await failGeneric("resolver returned null gitToken", null, "secret resolution failed");
        return;
      }

      const fixOptions: FixOptions = {
        traceId: request.traceId,
        collectorUrl,
        source: buildEngineSource(request, resolvedSecrets),
        llm: {
          provider: request.llm.provider,
          apiKey: resolvedSecrets.llmApiKey,
          ...(request.llm.model !== undefined ? { model: request.llm.model } : {}),
          ...(request.llm.maxTokens !== undefined ? { maxTokens: request.llm.maxTokens } : {}),
          ...(request.llm.temperature !== undefined ? { temperature: request.llm.temperature } : {}),
        },
        mode:
          request.mode === "bisect"
            ? { kind: "bisect", from: request.from!, to: request.to! }
            : { kind: request.mode },
        onProgress,
      };

      try {
        const result = await runFix(fixOptions);
        await sendEvent("result", {
          diff: result.diff,
          explanation: result.explanation,
          filesChanged: result.filesChanged,
          metaTraceId: result.metaTraceId,
          regressionSha: result.regressionSha,
          parentSha: result.parentSha,
        });
        await sendEvent("done", { ok: true });
      } catch (err) {
        await failGeneric("engine threw", err, "fix-engine failed");
      }
    });
  });

  return app;
}

/** Injection seams for tests and production wiring. */
export interface FixRouteOptions {
  runFix?: (options: FixOptions) => Promise<Awaited<ReturnType<typeof fix>>>;
  /**
   * Production resolver backed by #48's encrypted key store. Leave undefined
   * in dev/test to use the env-var stub.
   */
  secretResolver?: SecretResolver;
  /**
   * Lower-level seam used only by tests that want to short-circuit resolver
   * composition. Real deployments use `secretResolver`.
   */
  resolveSecrets?: (request: FixRequest) => Promise<ResolvedSecrets>;
  /**
   * Server-side log sink. The route logs full error detail here while emitting
   * sanitized messages to the SSE stream. Default: structured console logger.
   */
  logger?: Logger;
}

export interface ResolvedSecrets {
  llmApiKey: string;
  /** Present only when source.kind === "git"; undefined for path sources. */
  gitToken?: string;
}

export interface Logger {
  error: (message: string, detail?: Record<string, unknown>) => void;
  warn: (message: string, detail?: Record<string, unknown>) => void;
}

const defaultLogger: Logger = {
  error: (message, detail) => console.error(`[fix] ${message}`, detail ?? {}),
  warn: (message, detail) => console.warn(`[fix] ${message}`, detail ?? {}),
};

async function resolveRequestSecrets(
  request: FixRequest,
  resolver: SecretResolver,
): Promise<ResolvedSecrets> {
  const llmApiKey = await resolver.resolveLlmKey(request.projectId, request.llm.keyId);
  if (!llmApiKey) {
    // Throw a generic error; the route catches and emits a sanitized SSE
    // `error` event without echoing message content.
    throw new Error("resolver miss");
  }
  const out: ResolvedSecrets = { llmApiKey };
  if (request.source.kind === "git") {
    const gitToken = await resolver.resolveGitToken(request.projectId, request.source.tokenId);
    if (!gitToken) throw new Error("resolver miss");
    out.gitToken = gitToken;
  }
  return out;
}

function buildEngineSource(request: FixRequest, secrets: ResolvedSecrets): Source {
  if (request.source.kind === "path") {
    return { kind: "path", dir: request.source.dir };
  }
  return {
    kind: "git",
    repoUrl: request.source.repoUrl,
    token: secrets.gitToken ?? "",
    ...(request.source.ref !== undefined ? { ref: request.source.ref } : {}),
  };
}

function computeCollectorUrl(requestUrl: string): string {
  try {
    const url = new URL(requestUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "http://localhost:4100";
  }
}

/**
 * Turn any thrown value into something structured-log-safe. Drops the stack
 * (which upstream libs sometimes embed keys or token material in when they
 * include request payloads) and redacts every known secret string.
 */
function redactErrorForLog(err: unknown, secrets: Set<string>): Record<string, unknown> {
  if (err === null || err === undefined) return { kind: "none" };
  if (err instanceof Error) {
    return {
      kind: "error",
      name: err.name,
      message: redactString(err.message, secrets),
    };
  }
  if (typeof err === "string") {
    return { kind: "string", message: redactString(err, secrets) };
  }
  return { kind: "unknown", typeOf: typeof err };
}

function redactString(input: string, secrets: Set<string>): string {
  let out = input;
  for (const secret of secrets) {
    if (!secret) continue;
    // Escape regex metas so secret values containing `.` or `+` don't break.
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "g"), "[REDACTED]");
  }
  return out;
}

function collectSecretStrings(secrets: ResolvedSecrets | null): Set<string> {
  const out = new Set<string>();
  if (!secrets) return out;
  if (secrets.llmApiKey) out.add(secrets.llmApiKey);
  if (secrets.gitToken) out.add(secrets.gitToken);
  return out;
}
