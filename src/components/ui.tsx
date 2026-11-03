import type { ReactNode } from "react";

const STATUS_STYLE: Record<string, string> = {
  REQUESTED: "text-[var(--color-warn)] bg-[var(--color-warn-soft)]",
  CONFIRMED: "text-[var(--color-ok)] bg-[var(--color-ok-soft)]",
  CHECKED_IN: "text-[var(--color-brand-strong)] bg-[var(--color-brand-soft)]",
  IN_PROGRESS: "text-[var(--color-brand-strong)] bg-[var(--color-brand-soft)]",
  COMPLETED: "text-[var(--color-ink)] bg-[var(--color-surface-alt)]",
  REJECTED: "text-[var(--color-danger)] bg-[var(--color-danger-soft)]",
  CANCELLED: "text-[var(--color-danger)] bg-[var(--color-danger-soft)]",
  NO_SHOW: "text-[var(--color-danger)] bg-[var(--color-danger-soft)]",
  DRAFT: "text-[var(--color-ink-muted)] bg-[var(--color-surface-alt)]",
  SENT: "text-[var(--color-warn)] bg-[var(--color-warn-soft)]",
  ACCEPTED: "text-[var(--color-ok)] bg-[var(--color-ok-soft)]",
  DECLINED: "text-[var(--color-danger)] bg-[var(--color-danger-soft)]",
  SUPERSEDED: "text-[var(--color-ink-muted)] bg-[var(--color-surface-alt)]",
  EXPIRED: "text-[var(--color-ink-muted)] bg-[var(--color-surface-alt)]",
  ISSUED: "text-[var(--color-brand-strong)] bg-[var(--color-brand-soft)]",
  ACTIVE: "text-[var(--color-ok)] bg-[var(--color-ok-soft)]",
  ARCHIVED: "text-[var(--color-ink-muted)] bg-[var(--color-surface-alt)]",
  PENDING: "text-[var(--color-warn)] bg-[var(--color-warn-soft)]",
  VERIFIED: "text-[var(--color-ok)] bg-[var(--color-ok-soft)]",
  UNPAID: "text-[var(--color-danger)] bg-[var(--color-danger-soft)]",
  PARTIALLY_PAID: "text-[var(--color-warn)] bg-[var(--color-warn-soft)]",
  PAID: "text-[var(--color-ok)] bg-[var(--color-ok-soft)]",
};

const STATUS_TEXT: Record<string, string> = {
  REQUESTED: "Request pending",
  IN_PROGRESS: "In progress",
  CHECKED_IN: "Checked in",
  NO_SHOW: "No-show",
  PARTIALLY_PAID: "Partially paid",
};

/** Status is conveyed as text, not colour alone (§4.2). */
export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_TEXT[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return <span className={`badge ${STATUS_STYLE[status] ?? ""}`}>{label}</span>;
}

export function PageHeader({ title, children, lead }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {lead ? <p className="mt-1 text-[var(--color-ink-muted)]">{lead}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "danger" | "ok"; title?: string; children: ReactNode }) {
  const styles = {
    info: "border-[var(--color-brand)] bg-[var(--color-brand-soft)]",
    warn: "border-[var(--color-warn)] bg-[var(--color-warn-soft)]",
    danger: "border-[var(--color-danger)] bg-[var(--color-danger-soft)]",
    ok: "border-[var(--color-ok)] bg-[var(--color-ok-soft)]",
  }[tone];
  return (
    <div className={`rounded-lg border-l-4 p-4 ${styles}`} role={tone === "danger" ? "alert" : undefined}>
      {title ? <p className="font-bold">{title}</p> : null}
      <div className="text-[0.97rem]">{children}</div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="card text-[var(--color-ink-muted)]">{children}</p>;
}

export function Field({
  id, label, hint, error, children,
}: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="field-label">{label}</label>
      {hint ? <span id={`${id}-hint`} className="field-hint">{hint}</span> : null}
      {children}
      {error ? <span id={`${id}-error`} className="field-error">{error}</span> : null}
    </div>
  );
}
