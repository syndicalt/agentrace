#!/usr/bin/env node
/**
 * Seeds the local Pathlight stack with the data needed for the three
 * landing-site screenshots: fix.png, byok.png, openclaw.png.
 *
 * Run against a stack that's already up:
 *   docker compose up -d
 *   node scripts/seed-screenshots.mjs
 *
 * Idempotent — running twice creates a second set with fresh ids.
 */

const COLLECTOR = process.env.COLLECTOR_URL || "http://localhost:4100";
const PROJECT_ID = process.env.SEED_PROJECT_ID || "pathlight-demo";

async function http(path, init = {}) {
  const res = await fetch(`${COLLECTOR}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    throw new Error(`${init.method || "GET"} ${path} → ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function ensureProject() {
  const { projects } = await http("/v1/projects");
  const existing = projects.find((p) => p.id === PROJECT_ID || p.name === PROJECT_ID);
  if (existing) return existing.id;
  const created = await http("/v1/projects", {
    method: "POST",
    body: JSON.stringify({ name: PROJECT_ID, description: "Demo data for landing-page screenshots" }),
  });
  // The /v1/projects POST autogenerates an id. Use the returned id.
  return created.id;
}

async function createTrace(data) {
  const r = await http("/v1/traces", { method: "POST", body: JSON.stringify(data) });
  return r.id;
}

async function updateTrace(id, data) {
  return http(`/v1/traces/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

async function createSpan(data) {
  const r = await http("/v1/spans", { method: "POST", body: JSON.stringify(data) });
  return r.id;
}

async function updateSpan(id, data) {
  return http(`/v1/spans/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

async function event(spanId, data) {
  return http(`/v1/spans/${spanId}/events`, { method: "POST", body: JSON.stringify(data) });
}

// ---------- fix.png — failing trace with _source-tagged llm span ----------
async function seedFixTrace(projectId) {
  const traceId = await createTrace({
    name: "estimate-quote",
    projectId,
    input: JSON.stringify({ jobId: "job_5e2a", customer: "Atlas Roofing", lineItems: 4 }),
    gitCommit: "ffd3c94e2f51b6c0a8fa3e4d9c7b1e205a8f3b22",
    gitBranch: "master",
    gitDirty: false,
  });

  const planSpanId = await createSpan({
    traceId,
    name: "plan",
    type: "agent",
    input: JSON.stringify({ jobId: "job_5e2a" }),
    metadata: {
      _source: { file: "src/agents/quote.ts", line: 41, column: 12, func: "planQuote" },
    },
  });
  await updateSpan(planSpanId, {
    status: "completed",
    output: JSON.stringify({ steps: ["fetch_pricing", "compose_estimate"] }),
    durationMs: 184,
  });

  const llmSpanId = await createSpan({
    traceId,
    name: "llm.compose_estimate",
    type: "llm",
    parentSpanId: planSpanId,
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    input: JSON.stringify({
      messages: [
        { role: "system", content: "You compose roofing estimates. Return strict JSON: { lineItems: [...], total: number }." },
        { role: "user", content: "Job 5e2a: tear-off + 30sq architectural shingles + 2 skylights. Return the JSON." },
      ],
    }),
    metadata: {
      _source: { file: "src/agents/quote.ts", line: 87, column: 18, func: "composeEstimate" },
    },
  });
  await updateSpan(llmSpanId, {
    status: "failed",
    error: "Invalid JSON in model response: SyntaxError: Unexpected token 'T', \"The total \"... is not valid JSON",
    output: "The total comes out to about $14,200 plus tax — let me know if you'd like a breakdown!",
    inputTokens: 412,
    outputTokens: 38,
    cost: 0.0021,
    durationMs: 1842,
  });
  await event(llmSpanId, {
    name: "json.parse.error",
    level: "error",
    body: JSON.stringify({ at: "src/agents/quote.ts:91", message: "JSON.parse failed on model output" }),
  });

  await updateTrace(traceId, {
    status: "failed",
    error: "composeEstimate threw: Invalid JSON in model response",
    output: null,
    totalDurationMs: 2048,
    totalTokens: 450,
    totalCost: 0.0021,
  });

  return traceId;
}

// ---------- openclaw.png — nested agent → llm + tool + subagent ----------
async function seedOpenClawTrace(projectId) {
  const traceId = await createTrace({
    name: "openclaw:research-pricing",
    projectId,
    input: JSON.stringify({ task: "Research current asphalt-shingle pricing in Austin TX", maxSteps: 6 }),
    gitCommit: "ffd3c94e2f51b6c0a8fa3e4d9c7b1e205a8f3b22",
    gitBranch: "master",
    gitDirty: false,
    tags: ["openclaw"],
    metadata: { openclaw: { sessionId: "ocs_a14f", model: "claude-sonnet-4-6" } },
  });

  const rootAgent = await createSpan({
    traceId,
    name: "agent:researcher",
    type: "agent",
    input: JSON.stringify({ task: "Research asphalt-shingle pricing" }),
    metadata: { openclaw: { role: "root" } },
  });

  const planLlm = await createSpan({
    traceId,
    name: "llm.plan",
    type: "llm",
    parentSpanId: rootAgent,
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    input: JSON.stringify({ messages: [{ role: "user", content: "Plan the research" }] }),
  });
  await updateSpan(planLlm, {
    status: "completed",
    output: JSON.stringify({ plan: ["search_web", "delegate_pricing_lookup", "synthesize"] }),
    inputTokens: 220, outputTokens: 84, cost: 0.0011, durationMs: 940,
  });

  const searchTool = await createSpan({
    traceId,
    name: "tool:web_search",
    type: "tool",
    parentSpanId: rootAgent,
    toolName: "web_search",
    toolArgs: { query: "asphalt shingle pricing Austin TX 2026" },
  });
  await updateSpan(searchTool, {
    status: "completed",
    toolResult: JSON.stringify({ hits: 7, top: ["homedepot.com", "lowes.com", "abcsupply.com"] }),
    durationMs: 612,
  });

  const subAgent = await createSpan({
    traceId,
    name: "agent:pricing-lookup",
    type: "agent",
    parentSpanId: rootAgent,
    input: JSON.stringify({ vendor: "abcsupply.com", sku_pattern: "30yr-arch" }),
    metadata: { openclaw: { role: "subagent", delegatedBy: "researcher" } },
  });

  const subLlm = await createSpan({
    traceId,
    name: "llm.extract_price",
    type: "llm",
    parentSpanId: subAgent,
    model: "claude-haiku-4-5",
    provider: "anthropic",
    input: JSON.stringify({ messages: [{ role: "user", content: "Extract per-square pricing from this page" }] }),
  });
  await updateSpan(subLlm, {
    status: "completed",
    output: JSON.stringify({ pricePerSquare: 112.5, currency: "USD", confidence: 0.91 }),
    inputTokens: 1840, outputTokens: 42, cost: 0.0009, durationMs: 1208,
  });

  const subFetch = await createSpan({
    traceId,
    name: "tool:fetch",
    type: "tool",
    parentSpanId: subAgent,
    toolName: "fetch",
    toolArgs: { url: "https://abcsupply.com/products/30yr-arch" },
  });
  await updateSpan(subFetch, {
    status: "completed",
    toolResult: JSON.stringify({ status: 200, bytes: 24910 }),
    durationMs: 380,
  });

  await updateSpan(subAgent, {
    status: "completed",
    output: JSON.stringify({ pricePerSquare: 112.5, vendor: "abcsupply.com" }),
    durationMs: 1700,
  });

  const synthesizeLlm = await createSpan({
    traceId,
    name: "llm.synthesize",
    type: "llm",
    parentSpanId: rootAgent,
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    input: JSON.stringify({ messages: [{ role: "user", content: "Synthesize findings" }] }),
  });
  await updateSpan(synthesizeLlm, {
    status: "completed",
    output: "Asphalt shingle pricing in Austin TX runs $108-$118 per square for 30-year architectural; ABC Supply at $112.50 is the median.",
    inputTokens: 540, outputTokens: 96, cost: 0.0015, durationMs: 1320,
  });

  await updateSpan(rootAgent, {
    status: "completed",
    output: "Asphalt shingle pricing in Austin TX runs $108-$118 per square for 30-year architectural.",
    durationMs: 4640,
  });

  await updateTrace(traceId, {
    status: "completed",
    output: "Asphalt shingle pricing in Austin TX runs $108-$118 per square for 30-year architectural.",
    totalDurationMs: 4640,
    totalTokens: 2822,
    totalCost: 0.0035,
  });

  return traceId;
}

// ---------- byok.png — populate /settings/keys ----------
async function seedByokKeys(projectId) {
  // Three keys so the list shows kind/provider variety.
  const keys = [
    { kind: "llm", provider: "anthropic", label: "Claude — production",  value: "sk-ant-fake-prod-" + "x".repeat(48) + "kT2W" },
    { kind: "llm", provider: "openai",    label: "OpenAI — fallback",    value: "sk-proj-fake-" + "y".repeat(40) + "9aJq" },
    { kind: "git", provider: "github",    label: "GitHub — pathlight repo", value: "ghp_fakeexample" + "z".repeat(28) + "Pq4r" },
  ];
  const created = [];
  for (const k of keys) {
    const r = await http(`/v1/projects/${projectId}/keys`, {
      method: "POST",
      body: JSON.stringify(k),
    });
    created.push(r);
  }
  return created;
}

async function main() {
  console.log(`Collector: ${COLLECTOR}`);
  console.log(`Project:   ${PROJECT_ID}`);

  const projectId = await ensureProject();
  console.log(`✓ Project ready (id: ${projectId})`);

  const fixTraceId = await seedFixTrace(projectId);
  console.log(`✓ Fix-engine demo trace:  ${fixTraceId}`);
  console.log(`  → http://localhost:3100/traces/${fixTraceId}`);

  const ocTraceId = await seedOpenClawTrace(projectId);
  console.log(`✓ OpenClaw demo trace:    ${ocTraceId}`);
  console.log(`  → http://localhost:3100/traces/${ocTraceId}`);

  try {
    const keys = await seedByokKeys(projectId);
    console.log(`✓ BYOK keys seeded:       ${keys.length}`);
    console.log(`  → http://localhost:3100/settings/keys  (project id: ${projectId})`);
  } catch (err) {
    console.error(`✗ BYOK key seed failed (is PATHLIGHT_SEAL_KEY set on the collector?):`);
    console.error(`  ${err.message}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
