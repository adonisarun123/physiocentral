"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function TwoFactorPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="card">
      <h1 className="text-2xl font-bold">Two-step verification</h1>
      <p className="mt-1 text-sm">Enter the 6-digit code from your authenticator app.</p>
      <form
        className="mt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
          const { error } = await authClient.twoFactor.verifyTotp({ code });
          setPending(false);
          if (error) return setError(error.message ?? "That code did not work. Try the next code.");
          window.location.href = "/admin";
        }}
      >
        <label htmlFor="code" className="field-label">Code</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required className="input font-mono text-lg tracking-widest" />
        <div aria-live="polite">{error ? <p className="field-error">{error}</p> : null}</div>
        <button className="btn btn-primary mt-5 w-full" disabled={pending}>{pending ? "Checking…" : "Verify"}</button>
      </form>
    </div>
  );
}
