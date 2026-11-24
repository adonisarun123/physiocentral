import { DomainError } from "@/lib/errors";
import { getStaffActor } from "@/modules/auth/session";
import { openDocument } from "@/modules/patients/documents";

export const dynamic = "force-dynamic";

/**
 * GET /admin/documents/{id} — the stored file, shown in the browser.
 * Add ?download=1 to save it instead. Access is checked and logged on every open.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getStaffActor();
  if (!actor) return new Response("Sign in required.", { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const { id } = await params;
  try {
    const doc = await openDocument(actor, id);
    const download = new URL(req.url).searchParams.get("download") === "1";
    const isImage = doc.mimeType.startsWith("image/");
    return new Response(new Uint8Array(doc.content), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(doc.content.byteLength),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${doc.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        // The site-wide policy is not applied to this route (next.config.ts). Images are
        // fully sandboxed; PDFs can't be, because browser PDF viewers don't run in a sandbox.
        "Content-Security-Policy": isImage
          ? "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; sandbox"
          : "default-src 'none'; object-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      },
    });
  } catch (e) {
    if (e instanceof DomainError && (e.code === "FORBIDDEN" || e.code === "NOT_FOUND")) {
      return new Response(e.code === "FORBIDDEN" ? "You don't have access to this patient's documents." : "Document not found.", {
        status: e.code === "FORBIDDEN" ? 403 : 404, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    throw e;
  }
}
