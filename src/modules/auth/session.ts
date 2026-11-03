import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { loadStaffActor, type StaffActor } from "./actor";
import type { Permission } from "./permissions";

/**
 * Server-only Data Access Layer entry point (AUTH-01, Next.js DAL pattern).
 * Every protected page, Server Action and Route Handler resolves the actor
 * here; hiding UI is never the authorization boundary.
 * React cache() only dedupes within one request — it is not an auth cache.
 */
export const getStaffActor = cache(async (): Promise<StaffActor | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return loadStaffActor(session.user.id);
});

export const getSessionInfo = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session;
});

export async function requireStaff(perm?: Permission): Promise<StaffActor> {
  const actor = await getStaffActor();
  if (!actor) redirect("/admin/login");
  if (perm && !actor.permissions.has(perm)) redirect("/admin/forbidden");
  return actor;
}
