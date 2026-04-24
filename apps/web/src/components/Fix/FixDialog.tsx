"use client";

import { useEffect, useState } from "react";
import { FixForm, type FixFormValue } from "./FixForm";

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
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmitted, setLastSubmitted] = useState<FixFormValue | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setLastSubmitted(null);
    }
  }, [open]);

  if (!open || !context) return null;

  const handleSubmit = (value: FixFormValue): void => {
    // T4 wires the SSE stream here. For now the form flows to a captured
    // payload display so T3's key picker can be developed against a real form.
    setLastSubmitted(value);
    setSubmitting(false);
  };

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
            disabled={submitting}
            className="ml-auto text-zinc-500 hover:text-zinc-300 shrink-0 disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-5 overflow-y-auto">
          <FixForm
            projectId={context.projectId}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
          {lastSubmitted && (
            <div className="mt-5 bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">
                Captured payload (T4 streams this to /v1/fix)
              </p>
              <pre className="text-[11px] text-zinc-400 font-mono whitespace-pre-wrap">
                {JSON.stringify(lastSubmitted, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
