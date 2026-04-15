# @pathlight/sdk

TypeScript SDK for [Pathlight](https://github.com/syndicalt/pathlight) — visual debugging and observability for AI agents.

Instrument your AI agent with a few lines of code to capture full execution traces with visual debugging, waterfall timelines, and automatic source mapping.

## Install

```bash
npm install @pathlight/sdk
```

## Quick Start

```typescript
import { Pathlight } from "@pathlight/sdk";

const ag = new Pathlight({
  baseUrl: "http://localhost:4100",
});

// Start a trace
const trace = ag.trace("my-agent", { query: "..." });

// LLM call
const llmSpan = trace.span("classify", "llm", {
  model: "gpt-4o",
  input: { prompt: "Classify this query" },
});
const result = await llm.chat("Classify this query");
await llmSpan.end({ output: result, inputTokens: 50, outputTokens: 10 });

// Tool call
const toolSpan = trace.span("search", "tool", {
  toolName: "web_search",
  toolArgs: { query: "..." },
});
const results = await searchTool("...");
await toolSpan.end({ toolResult: results });

// End trace
await trace.end({ output: finalAnswer });
```

Open `http://localhost:3100` to see the visual trace.

## Span Types

| Type | Use For |
|------|---------|
| `llm` | LLM API calls |
| `tool` | Tool invocations |
| `retrieval` | RAG / document fetching |
| `agent` | Sub-agent calls |
| `chain` | Pipeline steps |
| `custom` | Anything else |

## Features

- **Automatic source mapping** — file, line, and function captured at each span creation
- **Async-safe** — spans initialize in the background, no `await` needed on creation
- **Token & cost tracking** — aggregated to the parent trace automatically
- **Events** — log decisions, warnings, or errors within a span

## API

See the full [Pathlight documentation](https://github.com/syndicalt/pathlight) for the collector setup and dashboard.

## License

MIT
