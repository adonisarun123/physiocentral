"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="mt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        const fd = new FormData(e.currentTarget);
        const { data, error } = await authClient.signIn.email({ email: String(fd.get("email")), password: String(fd.get("password")) });
        setPending(false);
        if (error) return setError(error.message ?? "Sign-in failed. Check your email and password.");
        if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return; // client plugin redirects
        window.location.href = "/admin";
      }}
    >
      <label htmlFor="email" className="field-label">Email</label>
      <input id="email" name="email" type="email" autoComplete="username" required className="input mb-4" />
      <label htmlFor="password" className="field-label">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      <div aria-live="polite">{error ? <p className="field-error">{error}</p> : null}</div>
      <button className="btn btn-primary mt-5 w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
