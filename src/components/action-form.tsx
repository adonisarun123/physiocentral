"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> } | null;

/**
 * Generic form wrapper for Server Actions: pending state disables duplicate
 * submits (server idempotency/version checks still apply), and the outcome is
 * announced via a live region. Success is shown only after the server commits.
 */
export function ActionForm({
  action, children, className, confirm,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state && !state.ok) ref.current?.focus();
  }, [state]);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <div aria-live="polite" className="mt-2">
        {state && !state.ok ? (
          <p ref={ref} tabIndex={-1} className="field-error">
            {state.error}
            {state.fieldErrors ? (
              <span className="block font-normal">
                {Object.entries(state.fieldErrors).map(([k, v]) => `${k}: ${v}`).join(" · ")}
              </span>
            ) : null}
          </p>
        ) : null}
        {state?.ok && state.message ? <p className="font-semibold text-[var(--color-ok)]">{state.message}</p> : null}
      </div>
    </form>
  );
}

export function SubmitButton({ children, variant = "primary", small }: { children: ReactNode; variant?: "primary" | "secondary" | "danger"; small?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn-${variant} ${small ? "btn-sm" : ""}`} disabled={pending} aria-disabled={pending}>
      {pending ? "Working…" : children}
    </button>
  );
}
