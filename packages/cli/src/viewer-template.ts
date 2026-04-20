/**
 * Produces a single-file HTML viewer with the trace bundle embedded as JSON.
 * The viewer is plain vanilla JS/CSS — no dependencies, no network calls.
 */

export interface ShareBundle {
  trace: Record<string, unknown>;
  spans: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  scores?: Array<Record<string, unknown>>;
  exportedAt: string;
  exportedBy?: string;
}

export function renderShareHtml(bundle: ShareBundle): string {
  // Serialize safely: escape </script> so a payload can't break out.
  const json = JSON.stringify(bundle).replace(/<\/script/gi, "<\\/script");
  const title = escapeHtml(String(bundle.trace.name || "Pathlight trace"));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Pathlight trace</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
    background: #09090b; color: #e4e4e7; line-height: 1.4; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
  h1 { font-size: 22px; margin: 0; }
  h2 { font-size: 13px; color: #a1a1aa; margin: 24px 0 10px; text-transform: uppercase; letter-spacing: .08em; }
  .meta { font-size: 12px; color: #71717a; margin-top: 4px; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px;
    border: 1px solid #27272a; background: #18181b; color: #a1a1aa; margin-left: 6px; }
  .pill-ok   { background: rgba(16,185,129,.15); color: #6ee7b7; border-color: rgba(16,185,129,.4); }
  .pill-fail { background: rgba(239, 68, 68,.15); color: #fca5a5; border-color: rgba(239, 68, 68,.4); }
  .pill-run  { background: rgba(59,130,246,.15); color: #93c5fd; border-color: rgba(59,130,246,.4); }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 16px; }
  .card { background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 14px; }
  .card .k { font-size: 10px; text-transform: uppercase; color: #71717a; letter-spacing: .08em; }
  .card .v { font-size: 18px; font-weight: 700; margin-top: 4px; }
  .jsonbox { background: #111113; border: 1px solid #27272a; border-radius: 6px; padding: 10px 12px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; font-size: 12px;
    white-space: pre-wrap; max-height: 260px; overflow: auto; color: #d4d4d8; }
  .io { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .span-row { display: grid; grid-template-columns: 200px 1fr 120px; gap: 12px; align-items: center;
    padding: 8px 12px; border-top: 1px solid #27272a; cursor: pointer; }
  .span-row:hover { background: rgba(39,39,42,.4); }
  .span-label { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .span-name { font-size: 13px; color: #e4e4e7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .span-type { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #27272a; color: #a1a1aa; }
  .span-type.llm { background: rgba(59,130,246,.2); color: #93c5fd; }
  .span-type.tool { background: rgba(16,185,129,.2); color: #6ee7b7; }
  .span-type.retrieval { background: rgba(139,92,246,.2); color: #c4b5fd; }
  .span-type.agent { background: rgba(249,115,22,.2); color: #fdba74; }
  .bar-outer { height: 14px; background: rgba(63,63,70,.5); border-radius: 4px; position: relative; overflow: hidden; }
  .bar-inner { height: 100%; position: absolute; top: 0; background: #3b82f6; opacity: .7; border-radius: 4px; }
  .bar-inner.tool { background: #10b981; }
  .bar-inner.retrieval { background: #8b5cf6; }
  .bar-inner.failed { background: #ef4444; }
  .duration { font-size: 12px; color: #a1a1aa; text-align: right; font-family: ui-monospace, monospace; }
  .banner { background: rgba(59,130,246,.1); border: 1px solid rgba(59,130,246,.3); border-radius: 8px;
    padding: 12px 16px; font-size: 12px; color: #93c5fd; margin-top: 24px; display: flex; justify-content: space-between; align-items: center; }
  details { margin-top: 8px; }
  summary { cursor: pointer; color: #a1a1aa; font-size: 12px; }
  details[open] summary { color: #e4e4e7; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px 12px; background: rgba(39,39,42,.3); }
  .k-line { font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; }
</style>
</head>
<body>
<div class="wrap">
  <div id="header"></div>
  <div class="grid-4" id="summary"></div>
  <h2>Input / Output</h2>
  <div class="io" id="io"></div>
  <h2>Timeline</h2>
  <div class="card" style="padding: 0;" id="timeline"></div>

  <div class="banner">
    <div>
      <strong>Shared Pathlight trace snapshot</strong><br>
      <span style="color:#71717a">Exported <span id="exported"></span>. Single-file HTML — no network calls.</span>
    </div>
    <a href="https://github.com/syndicalt/pathlight" target="_blank" rel="noopener" style="color:#93c5fd; text-decoration: none;">pathlight →</a>
  </div>
</div>
<script id="pathlight-data" type="application/json">${json}</script>
<script>
(function () {
  var data = JSON.parse(document.getElementById("pathlight-data").textContent);
  var trace = data.trace || {};
  var spans = data.spans || [];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function fmtDuration(ms) {
    if (ms == null) return "—";
    if (ms < 1000) return Math.round(ms) + "ms";
    if (ms < 60_000) return (ms / 1000).toFixed(1) + "s";
    return Math.floor(ms / 60_000) + "m " + Math.round((ms % 60_000) / 1000) + "s";
  }
  function fmtTokens(n) {
    if (n == null) return "—";
    if (n < 1000) return String(n);
    return (n / 1000).toFixed(1) + "K";
  }
  function pretty(s) {
    if (s == null) return "";
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch (e) { return String(s); }
  }
  function pillClass(status) {
    if (status === "completed") return "pill pill-ok";
    if (status === "failed") return "pill pill-fail";
    if (status === "running") return "pill pill-run";
    return "pill";
  }

  document.getElementById("header").innerHTML =
    '<h1>' + esc(trace.name) + '<span class="' + pillClass(trace.status) + '">' + esc(trace.status) + '</span></h1>' +
    '<div class="meta">' + esc(trace.id) + ' &middot; ' + esc(trace.createdAt || "") +
    (trace.gitCommit ? ' &middot; <code>' + esc(String(trace.gitCommit).slice(0, 7)) + '</code> ' + esc(trace.gitBranch || '') : '') +
    '</div>';

  document.getElementById("summary").innerHTML = [
    ["Duration", fmtDuration(trace.totalDurationMs)],
    ["Spans", String(spans.length)],
    ["Tokens", fmtTokens(trace.totalTokens)],
    ["Cost", trace.totalCost != null ? "$" + Number(trace.totalCost).toFixed(4) : "—"],
  ].map(function (row) {
    return '<div class="card"><div class="k">' + row[0] + '</div><div class="v">' + esc(row[1]) + '</div></div>';
  }).join("");

  document.getElementById("io").innerHTML =
    '<div><div class="k-line">Input</div><pre class="jsonbox">' + esc(pretty(trace.input)) + '</pre></div>' +
    '<div><div class="k-line">Output</div><pre class="jsonbox">' + esc(pretty(trace.output)) + '</pre></div>';

  // Timeline waterfall
  var startMs = spans.length ? new Date(spans[0].startedAt).getTime() : 0;
  var totalMs = trace.totalDurationMs || (spans.length ? Math.max.apply(null, spans.map(function (s) {
    return (new Date(s.startedAt).getTime() - startMs) + (s.durationMs || 0);
  })) : 1);

  var tl = document.getElementById("timeline");
  spans.forEach(function (span, idx) {
    var offset = Math.max(0, (new Date(span.startedAt).getTime() - startMs) / totalMs * 100);
    var width = Math.max(0.5, (span.durationMs || 0) / totalMs * 100);
    var barClass = "bar-inner " + (span.status === "failed" ? "failed" : esc(span.type));

    var row = document.createElement("div");
    row.className = "span-row";
    row.innerHTML =
      '<div class="span-label">' +
        '<span class="span-type ' + esc(span.type) + '">' + esc(span.type) + '</span>' +
        '<span class="span-name">' + esc(span.name) + '</span>' +
      '</div>' +
      '<div class="bar-outer"><div class="' + barClass + '" style="left:' + offset.toFixed(2) + '%;width:' + width.toFixed(2) + '%;"></div></div>' +
      '<div class="duration">' + fmtDuration(span.durationMs) + '</div>';

    var details = document.createElement("details");
    details.style.borderTop = "1px solid #27272a";
    var detailBody =
      '<div class="detail-grid">' +
        (span.input ? '<div><div class="k-line">Input</div><pre class="jsonbox">' + esc(pretty(span.input)) + '</pre></div>' : '') +
        (span.output ? '<div><div class="k-line">Output</div><pre class="jsonbox">' + esc(pretty(span.output)) + '</pre></div>' : '') +
        (span.error ? '<div style="grid-column:1/-1"><div class="k-line">Error</div><pre class="jsonbox" style="background:rgba(239,68,68,.1); color:#fca5a5">' + esc(span.error) + '</pre></div>' : '') +
      '</div>';

    var summary = document.createElement("summary");
    summary.appendChild(row);
    details.appendChild(summary);
    var bodyEl = document.createElement("div");
    bodyEl.innerHTML = detailBody;
    details.appendChild(bodyEl);

    tl.appendChild(details);
  });

  document.getElementById("exported").textContent = data.exportedAt || "";
})();
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
