"use client";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  return (
    <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={async () => { await authClient.signOut(); window.location.href = "/admin/login"; }}>
      Sign out
    </button>
  );
}
