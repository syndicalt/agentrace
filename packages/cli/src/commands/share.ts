import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderShareHtml, type ShareBundle } from "../viewer-template.js";

export interface ShareOptions {
  traceId: string;
  baseUrl: string;
  output?: string;
  redactInput?: boolean;
  redactOutput?: boolean;
  redactErrors?: boolean;
}

interface TraceFetch {
  trace: Record<string, unknown>;
  spans: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  scores?: Array<Record<string, unknown>>;
}

function redactObject(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row };
  for (const f of fields) {
    if (f in copy && copy[f] != null) copy[f] = "[redacted]";
  }
  return copy;
}

export async function runShare(opts: ShareOptions): Promise<string> {
  const base = opts.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/v1/traces/${opts.traceId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch trace ${opts.traceId}: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as TraceFetch;

  const redactFields: string[] = [];
  if (opts.redactInput) redactFields.push("input", "toolArgs");
  if (opts.redactOutput) redactFields.push("output", "toolResult");
  if (opts.redactErrors) redactFields.push("error");

  const trace = redactFields.length > 0 ? redactObject(data.trace, redactFields) : data.trace;
  const spans = redactFields.length > 0 ? data.spans.map((s) => redactObject(s, redactFields)) : data.spans;

  const bundle: ShareBundle = {
    trace,
    spans,
    events: data.events || [],
    scores: data.scores || [],
    exportedAt: new Date().toISOString(),
    exportedBy: process.env.USER || undefined,
  };

  const html = renderShareHtml(bundle);
  const outputPath = resolve(process.cwd(), opts.output || `pathlight-${opts.traceId.slice(0, 10)}.html`);
  await writeFile(outputPath, html, "utf-8");
  return outputPath;
}
