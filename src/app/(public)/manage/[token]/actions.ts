"use server";

import { revalidatePath } from "next/cache";
import { correlationId, DomainError } from "@/lib/errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/http";
import { resolveManageToken } from "@/modules/scheduling/manage-link";
import { cancelAppointment } from "@/modules/scheduling/appointments";
import { decideEstimate } from "@/modules/billing/estimates";
import type { ActionResult } from "@/components/action-form";

async function linkActor(fd: FormData) {
  await rateLimit(`manage:${await clientIp()}`, 30, 300);
  const token = String(fd.get("token") ?? "");
  const actor = await resolveManageToken(token);
  if (!actor) throw new DomainError("NOT_FOUND", "This link is no longer valid.");
  return { actor, token };
}

function fail(e: unknown): ActionResult {
  if (e instanceof DomainError) return { ok: false, error: e.message, code: e.code };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again or call the clinic." };
}

export async function patientCancelAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const { actor, token } = await linkActor(fd);
    await cancelAppointment(actor, { appointmentId: actor.appointmentId, reason: `Patient: ${String(fd.get("reason") ?? "").slice(0, 200)}` }, correlationId());
    revalidatePath(`/manage/${token}`);
    return { ok: true, message: "Cancelled." };
  } catch (e) {
    return fail(e);
  }
}

export async function patientDecideEstimateAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const { actor, token } = await linkActor(fd);
    const decision = fd.get("decision") === "ACCEPTED" ? "ACCEPTED" : "DECLINED";
    await decideEstimate(actor, {
      versionId: String(fd.get("versionId")),
      decision,
      contentHash: String(fd.get("contentHash")),
      method: "SECURE_LINK",
    }, correlationId());
    revalidatePath(`/manage/${token}`);
    return { ok: true, message: decision === "ACCEPTED" ? "Thank you — estimate accepted." : "Estimate declined." };
  } catch (e) {
    return fail(e);
  }
}
