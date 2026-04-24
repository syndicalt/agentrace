import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginState } from "../state.js";

export function registerDelegationHooks(api: OpenClawPluginApi, state: PluginState): void {
  api.on("subagent_spawning", async (event, ctx) => {
    const parentRunId = ctx.runId;
    const childSessionKey = event.childSessionKey;
    if (!parentRunId || !childSessionKey) return;
    const parentTrace = state.getTrace(parentRunId);
    if (!parentTrace) return;

    const span = parentTrace.span(event.agentId, "agent", {
      input: {
        childSessionKey: event.childSessionKey,
        agentId: event.agentId,
        label: event.label,
        mode: event.mode,
      },
      metadata: {
        openclawChildSessionKey: childSessionKey,
        parentRunId,
      },
    });
    state.setSubagentSpan(childSessionKey, span);
  });

  api.on("subagent_ended", async (event, _ctx) => {
    const childSessionKey = event.targetSessionKey;
    if (!childSessionKey) return;
    const span = state.takeSubagentSpan(childSessionKey);
    if (!span) return;

    const failed = event.outcome === "error" || event.outcome === "timeout" || event.outcome === "killed";
    try {
      await span.end({
        output: { reason: event.reason, outcome: event.outcome },
        error: event.error,
        status: failed ? "failed" : "completed",
      });
    } catch (err) {
      api.logger.warn("pathlight: subagent span.end failed", { childSessionKey, err: String(err) });
    }
  });
}
