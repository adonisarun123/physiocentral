import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <div className="card">
      <h1 className="text-2xl font-bold">Staff sign in</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Accounts are created by invitation. Password managers and pasted codes are supported.</p>
      <LoginForm />
    </div>
  );
}
