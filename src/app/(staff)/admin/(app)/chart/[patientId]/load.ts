import "server-only";
import { notFound, redirect } from "next/navigation";
import { DomainError } from "@/lib/errors";

/** Map clinical access errors to the admin's forbidden / not-found pages. */
export async function orDeny<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof DomainError && e.code === "FORBIDDEN") redirect("/admin/forbidden");
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
}
