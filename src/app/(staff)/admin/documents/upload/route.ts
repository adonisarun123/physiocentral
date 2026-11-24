import { revalidatePath } from "next/cache";
import { DomainError } from "@/lib/errors";
import { assertSameOrigin, jsonRoute } from "@/lib/http";
import { getStaffActor } from "@/modules/auth/session";
import { MAX_DOCUMENT_BYTES, uploadDocument } from "@/modules/patients/documents";

export const dynamic = "force-dynamic";

/**
 * POST /admin/documents/upload — multipart form: patientId, kind, title, documentDate, file.
 * A Route Handler rather than a Server Action so the file size limit is ours to
 * enforce (Server Actions cap bodies at 1 MB by default).
 */
export async function POST(req: Request) {
  return jsonRoute(async (cid) => {
    await assertSameOrigin();
    const actor = await getStaffActor();
    if (!actor) throw new DomainError("UNAUTHENTICATED", "Your session has ended. Please sign in again.");
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_DOCUMENT_BYTES + 64 * 1024) {
      throw new DomainError("VALIDATION", `The file is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`, { file: "Too large" });
    }
    const fd = await req.formData().catch(() => null);
    if (!fd) throw new DomainError("VALIDATION", "Upload could not be read. Try again.");
    const file = fd.get("file");
    if (!(file instanceof File)) throw new DomainError("VALIDATION", "Choose a file.", { file: "Required" });
    if (file.size > MAX_DOCUMENT_BYTES) throw new DomainError("VALIDATION", `The file is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`, { file: "Too large" });
    const str = (k: string) => String(fd.get(k) ?? "");
    const r = await uploadDocument(actor, {
      patientId: str("patientId"), kind: str("kind"), title: str("title"), documentDate: str("documentDate") || null,
      fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()),
    }, cid);
    revalidatePath(`/admin/patients/${str("patientId")}`);
    revalidatePath(`/admin/chart/${str("patientId")}`);
    return r;
  }, 201);
}
