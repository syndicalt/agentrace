/**
 * Handwritten validator for `POST /v1/fix` request bodies.
 *
 * We intentionally don't add zod/typebox as a dep just for this one endpoint —
 * the codebase doesn't use a validation library today and the fix-request shape
 * is narrow enough that explicit checks are clearer than a schema DSL.
 *
 * Error messages are safe to echo to the client: they describe shape issues
 * only, never values. This matters because the request body carries `keyId`
 * and `tokenId` references that resolve to secrets — we must never quote input
 * values back in errors (see parent invariant #1 in issue #44).
 */

export type FixRequestMode = "span" | "trace" | "bisect";

export interface FixRequestPathSource {
  kind: "path";
  dir: string;
}

export interface FixRequestGitSource {
  kind: "git";
  repoUrl: string;
  tokenId: string;
  ref?: string;
}

export type FixRequestSource = FixRequestPathSource | FixRequestGitSource;

export interface FixRequestLlm {
  provider: "anthropic" | "openai";
  keyId: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface FixRequest {
  /** Pathlight trace ID whose failure we want to fix. */
  traceId: string;
  /** Pathlight project ID. Auth deferred — any well-formed value is accepted. */
  projectId: string;
  source: FixRequestSource;
  llm: FixRequestLlm;
  mode: FixRequestMode;
  /** bisect-only: starting commit SHA (inclusive, last-known-good). */
  from?: string;
  /** bisect-only: ending commit SHA (inclusive, first-known-bad). */
  to?: string;
}

export interface ValidationFailure {
  ok: false;
  error: string;
  field: string;
}

export interface ValidationSuccess {
  ok: true;
  value: FixRequest;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

function fail(field: string, error: string): ValidationFailure {
  return { ok: false, field, error };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function validateSource(raw: unknown, field: string): ValidationResult | FixRequestSource {
  if (!raw || typeof raw !== "object") return fail(field, "source must be an object");
  const s = raw as Record<string, unknown>;
  if (s.kind === "path") {
    if (!isNonEmptyString(s.dir)) return fail(`${field}.dir`, "source.dir is required for path sources");
    return { kind: "path", dir: s.dir };
  }
  if (s.kind === "git") {
    if (!isNonEmptyString(s.repoUrl)) return fail(`${field}.repoUrl`, "source.repoUrl is required for git sources");
    if (!isNonEmptyString(s.tokenId)) return fail(`${field}.tokenId`, "source.tokenId is required for git sources");
    if (s.ref !== undefined && !isNonEmptyString(s.ref)) return fail(`${field}.ref`, "source.ref must be a non-empty string");
    const out: FixRequestGitSource = { kind: "git", repoUrl: s.repoUrl, tokenId: s.tokenId };
    if (s.ref !== undefined) out.ref = s.ref as string;
    return out;
  }
  return fail(`${field}.kind`, "source.kind must be 'path' or 'git'");
}

function validateLlm(raw: unknown, field: string): ValidationResult | FixRequestLlm {
  if (!raw || typeof raw !== "object") return fail(field, "llm must be an object");
  const l = raw as Record<string, unknown>;
  if (l.provider !== "anthropic" && l.provider !== "openai") {
    return fail(`${field}.provider`, "llm.provider must be 'anthropic' or 'openai'");
  }
  if (!isNonEmptyString(l.keyId)) return fail(`${field}.keyId`, "llm.keyId is required");
  if (l.model !== undefined && !isNonEmptyString(l.model)) {
    return fail(`${field}.model`, "llm.model must be a non-empty string");
  }
  if (l.maxTokens !== undefined && (typeof l.maxTokens !== "number" || !Number.isFinite(l.maxTokens) || l.maxTokens <= 0)) {
    return fail(`${field}.maxTokens`, "llm.maxTokens must be a positive number");
  }
  if (l.temperature !== undefined && (typeof l.temperature !== "number" || !Number.isFinite(l.temperature))) {
    return fail(`${field}.temperature`, "llm.temperature must be a number");
  }
  const out: FixRequestLlm = { provider: l.provider, keyId: l.keyId };
  if (l.model !== undefined) out.model = l.model as string;
  if (l.maxTokens !== undefined) out.maxTokens = l.maxTokens as number;
  if (l.temperature !== undefined) out.temperature = l.temperature as number;
  return out;
}

function isValidationFailure(v: unknown): v is ValidationFailure {
  return typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === false;
}

export function validateFixRequest(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object") return fail("body", "request body must be a JSON object");
  const r = raw as Record<string, unknown>;

  if (!isNonEmptyString(r.traceId)) return fail("traceId", "traceId is required");
  if (!isNonEmptyString(r.projectId)) return fail("projectId", "projectId is required");

  const mode = r.mode;
  if (mode !== "span" && mode !== "trace" && mode !== "bisect") {
    return fail("mode", "mode must be 'span', 'trace', or 'bisect'");
  }

  const source = validateSource(r.source, "source");
  if (isValidationFailure(source)) return source;

  const llm = validateLlm(r.llm, "llm");
  if (isValidationFailure(llm)) return llm;

  const out: FixRequest = {
    traceId: r.traceId,
    projectId: r.projectId,
    source: source as FixRequestSource,
    llm: llm as FixRequestLlm,
    mode,
  };

  if (mode === "bisect") {
    if (!isNonEmptyString(r.from)) return fail("from", "from is required for bisect mode");
    if (!isNonEmptyString(r.to)) return fail("to", "to is required for bisect mode");
    out.from = r.from;
    out.to = r.to;
  } else {
    if (r.from !== undefined) return fail("from", "from is only valid for bisect mode");
    if (r.to !== undefined) return fail("to", "to is only valid for bisect mode");
  }

  return { ok: true, value: out };
}
