"use client";

import { useEffect } from "react";

export interface FixContext {
  traceId: string;
  spanId?: string;
  projectId: string | null;
}

interface FixDialogProps {
  open: boolean;
  context: FixContext | null;
  onClose: () => void;
}

export function FixDialog({ open, context, onClose }: FixDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !context) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Propose a fix"
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="border-b border-zinc-800 px-5 py-3 flex items-center gap-3">
          <h2 className="font-semibold">Propose a fix</h2>
          <span className="text-xs text-zinc-500 font-mono truncate">
            trace {context.traceId.slice(0, 12)}
            {context.spanId ? ` · span ${context.spanId.slice(0, 8)}` : ""}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-zinc-500 hover:text-zinc-300 shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-6 space-y-3 overflow-y-auto">
          <p className="text-sm text-zinc-400">
            Fix form lands in T2. Key picker in T3. SSE stream in T4. Diff preview in T5.
          </p>
        </div>
      </div>
    </div>
  );
}
