import { EventEmitter } from "node:events";
import { nanoid } from "nanoid";

export interface Breakpoint {
  id: string;
  label: string;
  traceId: string | null;
  spanId: string | null;
  state: unknown;
  createdAt: string;
}

interface InternalBreakpoint extends Breakpoint {
  resolve: (resumeState: unknown) => void;
  reject: (err: Error) => void;
}

const active = new Map<string, InternalBreakpoint>();
export const breakpointEvents = new EventEmitter();
breakpointEvents.setMaxListeners(100);

export function listBreakpoints(): Breakpoint[] {
  return Array.from(active.values()).map(({ resolve: _r, reject: _j, ...rest }) => rest);
}

export function registerBreakpoint(params: {
  label: string;
  traceId?: string | null;
  spanId?: string | null;
  state?: unknown;
}): { id: string; wait: Promise<unknown> } {
  const id = nanoid();
  const record: Partial<InternalBreakpoint> = {
    id,
    label: params.label,
    traceId: params.traceId || null,
    spanId: params.spanId || null,
    state: params.state ?? null,
    createdAt: new Date().toISOString(),
  };

  const wait = new Promise<unknown>((resolve, reject) => {
    record.resolve = resolve;
    record.reject = reject;
  });

  active.set(id, record as InternalBreakpoint);
  breakpointEvents.emit("added", record as Breakpoint);
  return { id, wait };
}

export function resumeBreakpoint(id: string, state: unknown): boolean {
  const bp = active.get(id);
  if (!bp) return false;
  active.delete(id);
  bp.resolve(state);
  breakpointEvents.emit("resolved", { id, state });
  return true;
}

export function cancelBreakpoint(id: string, reason: string): boolean {
  const bp = active.get(id);
  if (!bp) return false;
  active.delete(id);
  bp.reject(new Error(reason));
  breakpointEvents.emit("cancelled", { id, reason });
  return true;
}
