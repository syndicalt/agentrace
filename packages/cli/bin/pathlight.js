#!/usr/bin/env node
// Pathlight CLI — subcommand router.
//
// Commands:
//   pathlight share <trace-id> [options]
//
// Options for share:
//   --base-url <url>       Collector URL (default: $PATHLIGHT_URL or http://localhost:4100)
//   --out <path>           Output HTML path (default: ./pathlight-<id>.html)
//   --redact-input         Replace input / toolArgs with "[redacted]"
//   --redact-output        Replace output / toolResult with "[redacted]"
//   --redact-errors        Replace error messages with "[redacted]"

import { runShare } from "../dist/commands/share.js";

function usage() {
  console.log(
    "Usage: pathlight <command> [...args]\n\n" +
    "Commands:\n" +
    "  share <trace-id>     Export a single-file HTML snapshot of a trace\n\n" +
    "Run `pathlight <command> --help` for command-specific help.",
  );
}

const [, , command, ...rest] = process.argv;

if (!command || command === "--help" || command === "-h") {
  usage();
  process.exit(command ? 0 : 1);
}

if (command === "share") {
  const askedForHelp = rest.includes("--help") || rest.includes("-h");
  const traceIdArgs = rest.filter((a) => !a.startsWith("--") && !isOptionValue(rest, a));
  const traceId = traceIdArgs[0];
  if (!traceId || askedForHelp) {
    console.log(
      "Usage: pathlight share <trace-id> [options]\n\n" +
      "Options:\n" +
      "  --base-url <url>    Collector URL (default: $PATHLIGHT_URL or http://localhost:4100)\n" +
      "  --out <path>        Output HTML path\n" +
      "  --redact-input      Redact input / toolArgs\n" +
      "  --redact-output     Redact output / toolResult\n" +
      "  --redact-errors     Redact error messages",
    );
    process.exit(askedForHelp ? 0 : 1);
  }
  const baseUrl = getOpt(rest, "--base-url") || process.env.PATHLIGHT_URL || "http://localhost:4100";
  const out = getOpt(rest, "--out");
  try {
    const path = await runShare({
      traceId,
      baseUrl,
      output: out,
      redactInput: rest.includes("--redact-input"),
      redactOutput: rest.includes("--redact-output"),
      redactErrors: rest.includes("--redact-errors"),
    });
    console.log(`Wrote ${path}`);
    console.log("Open it directly in a browser — no server needed.");
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
} else {
  console.error(`Unknown command: ${command}`);
  usage();
  process.exit(1);
}

function getOpt(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
function isOptionValue(args, value) {
  const i = args.indexOf(value);
  if (i <= 0) return false;
  const prev = args[i - 1];
  return prev === "--base-url" || prev === "--out";
}
