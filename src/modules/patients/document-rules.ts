/** Pure rules for patient documents (no DB), shared by the upload form, the service and tests. */

/**
 * 4 MB: Vercel functions reject request bodies over about 4.5 MB, so larger
 * files would fail in transit. Photos are shrunk in the browser before upload;
 * PDFs over the limit must be compressed or split first.
 */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

export const DOCUMENT_KINDS = [
  ["XRAY", "X-ray"],
  ["MRI", "MRI"],
  ["CT", "CT scan"],
  ["ULTRASOUND", "Ultrasound"],
  ["LAB", "Lab report"],
  ["PRESCRIPTION", "Prescription"],
  ["DISCHARGE", "Discharge summary"],
  ["REFERRAL", "Referral letter"],
  ["OTHER", "Other"],
] as const;
export const documentKindLabel = (k: string) => DOCUMENT_KINDS.find(([v]) => v === k)?.[1] ?? k;

export type DocumentMime = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

/** File type from its first bytes (magic numbers). Anything else is refused. */
export function detectFileType(b: Uint8Array): DocumentMime | null {
  const at = (i: number, ...v: number[]) => v.every((x, j) => b[i + j] === x);
  if (b.length >= 5 && at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp"; // RIFF....WEBP
  return null;
}

const EXT: Record<DocumentMime, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** A file name safe for a Content-Disposition header, with the extension that matches the real type. */
export function safeFileName(raw: string, mime: DocumentMime): string {
  const base = raw.replace(/\.[^.]*$/, "").normalize("NFKD").replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${base || "document"}.${EXT[mime]}`;
}
