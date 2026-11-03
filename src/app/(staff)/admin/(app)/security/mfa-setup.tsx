"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function MfaSetup() {
  const [uri, setUri] = useState<string | null>(null);
  const [backup, setBackup] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const secret = uri ? new URL(uri).searchParams.get("secret") : null;

  if (done) return <p className="font-semibold text-[var(--color-ok)]">Two-step verification is now on. You&apos;ll be asked for a code at sign-in.</p>;

  return (
    <div>
      {!uri ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const password = String(new FormData(e.currentTarget).get("password"));
            const { data, error } = await authClient.twoFactor.enable({ password });
            if (error || !data || data.method !== "totp") return setError(error?.message ?? "Could not start setup.");
            setUri(data.totpURI);
            setBackup(data.backupCodes);
          }}
        >
          <label htmlFor="pw" className="field-label">Confirm your password</label>
          <input id="pw" name="password" type="password" autoComplete="current-password" required className="input" />
          <div aria-live="polite">{error ? <p className="field-error">{error}</p> : null}</div>
          <button className="btn btn-primary mt-4">Set up authenticator app</button>
        </form>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
            const { error } = await authClient.twoFactor.verifyTotp({ code });
            if (error) return setError(error.message ?? "Code not accepted. Try the next one.");
            setDone(true);
          }}
        >
          <ol className="list-decimal space-y-2 pl-5">
            <li>In your authenticator app choose <strong>Enter a setup key</strong> and paste this key:
              <span className="mt-1 block break-all rounded bg-[var(--color-surface-alt)] p-2 font-mono">{secret}</span></li>
            <li>Save these backup codes somewhere safe (each works once):
              <span className="mt-1 block font-mono text-sm">{backup?.join("  ")}</span></li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <label htmlFor="code" className="field-label mt-3">Code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required className="input max-w-40 font-mono" />
          <div aria-live="polite">{error ? <p className="field-error">{error}</p> : null}</div>
          <button className="btn btn-primary mt-4">Verify and turn on</button>
        </form>
      )}
    </div>
  );
}
