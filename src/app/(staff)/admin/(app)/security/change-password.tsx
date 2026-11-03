"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/** Change own password; signs out every other device. */
export function ChangePassword() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const next = String(fd.get("new"));
        if (next !== String(fd.get("confirm"))) return setMsg({ ok: false, text: "The new passwords don't match." });
        if (next.length < 12) return setMsg({ ok: false, text: "Use at least 12 characters — a short phrase works well." });
        setPending(true);
        const { error } = await authClient.changePassword({ currentPassword: String(fd.get("current")), newPassword: next, revokeOtherSessions: true });
        setPending(false);
        if (error) return setMsg({ ok: false, text: error.message ?? "Could not change the password. Check your current password." });
        form.reset();
        setMsg({ ok: true, text: "Password changed. Other devices have been signed out." });
      }}
    >
      <label htmlFor="cp-c" className="field-label">Current password</label>
      <input id="cp-c" name="current" type="password" autoComplete="current-password" required className="input mb-3" />
      <label htmlFor="cp-n" className="field-label">New password (12+ characters)</label>
      <input id="cp-n" name="new" type="password" autoComplete="new-password" minLength={12} required className="input mb-3" />
      <label htmlFor="cp-r" className="field-label">Repeat new password</label>
      <input id="cp-r" name="confirm" type="password" autoComplete="new-password" minLength={12} required className="input" />
      <div aria-live="polite" className="mt-2">{msg ? <p className={msg.ok ? "font-semibold text-[var(--color-ok)]" : "field-error"}>{msg.text}</p> : null}</div>
      <button className="btn btn-primary mt-3" disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
    </form>
  );
}
