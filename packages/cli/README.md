# @pathlight/cli

Command-line utilities for [Pathlight](https://github.com/syndicalt/pathlight).

## Install

```bash
npm install -g @pathlight/cli
# or run ad-hoc
npx @pathlight/cli share <trace-id>
```

## `pathlight share`

Export a single-file HTML snapshot of a trace. Perfect for attaching to bug
reports, PR comments, or incident channels — the recipient doesn't need
Pathlight installed, there are no network calls, and the file opens in any
browser.

```bash
pathlight share abc123def --out ./bug-report.html
```

### Options

| Flag                | Default                                  | Purpose                                   |
| ------------------- | ---------------------------------------- | ----------------------------------------- |
| `--base-url <url>`  | `$PATHLIGHT_URL` or `http://localhost:4100` | Collector URL                          |
| `--out <path>`      | `./pathlight-<id>.html`                  | Output file path                          |
| `--redact-input`    |                                          | Replace input / toolArgs with `[redacted]`|
| `--redact-output`   |                                          | Replace output / toolResult               |
| `--redact-errors`   |                                          | Replace error messages                    |

### What's in the file

Trace metadata, all spans (waterfall + per-span JSON), input/output, events, and
git provenance if captured. No scripts other than the vanilla rendering logic —
it's safe to send across security boundaries.
