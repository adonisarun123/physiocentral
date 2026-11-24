import { createHash } from "node:crypto";
import { getPool, q, q1, tx } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit } from "@/modules/audit";
import { assertPermission, type Actor, type StaffActor } from "@/modules/auth/actor";
import { assertCareTeam } from "@/modules/clinical/access";
import { detectFileType, DOCUMENT_KINDS, MAX_DOCUMENT_BYTES, safeFileName } from "./document-rules";

export { DOCUMENT_KINDS, MAX_DOCUMENT_BYTES, documentKindLabel } from "./document-rules";

/**
 * Patient documents: scans and reports (X-ray, MRI, lab reports…).
 *
 * Who can do what:
 *  - Upload: DOCUMENT_UPLOAD (reception, physios, clinic admin, owner). Reception
 *    often scans in what the patient brings, so upload does not need chart access.
 *  - List / open / remove: clinical-record access to that patient (care team, or
 *    the clinical lead), because reports carry diagnoses. Reception sees only how
 *    many documents are on file.
 * Every open is written to the audit history. Files are stored in Postgres; the
 * type is checked from the file's own bytes, never from the browser's claim.
 */

export interface UploadInput {
  patientId: string;
  kind: string;
  title: string;
  documentDate?: string | null;
  fileName: string;
  bytes: Uint8Array;
}

export async function uploadDocument(actor: Actor, input: UploadInput, correlationId: string) {
  assertPermission(actor, "DOCUMENT_UPLOAD");
  const fe: Record<string, string> = {};
  if (!/^[0-9a-f-]{36}$/i.test(input.patientId)) throw new DomainError("NOT_FOUND", "Patient not found.");
  if (!DOCUMENT_KINDS.some(([k]) => k === input.kind)) fe.kind = "Choose the type of document";
  const title = input.title.trim();
  if (title.length < 2 || title.length > 120) fe.title = "Give it a short name (2–120 characters)";
  const date = input.documentDate?.trim() || null;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))) fe.documentDate = "Enter a valid date";
  if (input.bytes.byteLength === 0) fe.file = "Choose a file";
  else if (input.bytes.byteLength > MAX_DOCUMENT_BYTES) fe.file = `The file is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB`;
  const mime = input.bytes.byteLength ? detectFileType(input.bytes) : null;
  if (input.bytes.byteLength && !fe.file && !mime) fe.file = "Only PDF, JPEG, PNG or WebP files can be uploaded";
  if (Object.keys(fe).length) throw new DomainError("VALIDATION", "Please correct the highlighted fields.", fe);

  const sha = createHash("sha256").update(input.bytes).digest("hex");
  const fileName = safeFileName(input.fileName, mime!);
  return tx(async (db) => {
    const p = await q1<{ id: string }>(`SELECT id FROM patient WHERE id=$1 AND organization_id=$2`, [input.patientId, actor.organizationId], db);
    if (!p) throw new DomainError("NOT_FOUND", "Patient not found.");
    const dup = await q1<{ id: string }>(
      `SELECT id FROM patient_document WHERE patient_id=$1 AND sha256=$2 AND deleted_at IS NULL`, [p.id, sha], db);
    if (dup) throw new DomainError("DUPLICATE", "This exact file is already on this patient's record.");
    const row = (await q1<{ id: string }>(
      `INSERT INTO patient_document (organization_id, patient_id, kind, title, document_date, file_name, mime_type, size_bytes, sha256, uploaded_by, uploaded_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [actor.organizationId, p.id, input.kind, title, date, fileName, mime, input.bytes.byteLength, sha, actor.label, actor.displayName], db))!;
    await db.query(`INSERT INTO patient_document_content (document_id, content) VALUES ($1,$2)`, [row.id, Buffer.from(input.bytes)]);
    // No title in the audit log: titles can name a diagnosis.
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "clinical.document.upload", targetType: "patient", targetId: p.id,
      changes: { documentId: row.id, kind: input.kind, bytes: input.bytes.byteLength }, correlationId });
    return { documentId: row.id };
  });
}

export interface DocumentRow {
  id: string; kind: string; title: string; document_date: string | null; file_name: string; mime_type: string;
  size_bytes: number; uploaded_by_name: string; created_at: Date;
}

/** Documents on a patient's record, for the clinical record. Requires chart access. */
export async function listDocuments(actor: StaffActor, patientId: string): Promise<DocumentRow[]> {
  const { patient } = await assertCareTeam(actor, patientId, "CLINICAL_NOTES_READ");
  return q<DocumentRow>(
    `SELECT id, kind, title, to_char(document_date,'YYYY-MM-DD') document_date, file_name, mime_type, size_bytes, uploaded_by_name, created_at
       FROM patient_document WHERE patient_id=$1 AND deleted_at IS NULL ORDER BY COALESCE(document_date, created_at::date) DESC, created_at DESC`,
    [patient.id]);
}

/** How many documents are on file — all reception is shown. */
export async function documentCount(actor: StaffActor, patientId: string): Promise<number> {
  const r = await q1<{ n: number }>(
    `SELECT count(*)::int n FROM patient_document WHERE patient_id=$1 AND organization_id=$2 AND deleted_at IS NULL`, [patientId, actor.organizationId]);
  return r?.n ?? 0;
}

/** The file itself, for viewing or download. Checks chart access and logs the open. */
export async function openDocument(actor: StaffActor, documentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) throw new DomainError("NOT_FOUND", "Document not found.");
  const meta = await q1<{ id: string; patient_id: string; file_name: string; mime_type: string }>(
    `SELECT id, patient_id, file_name, mime_type FROM patient_document WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`,
    [documentId, actor.organizationId]);
  if (!meta) throw new DomainError("NOT_FOUND", "Document not found.");
  await assertCareTeam(actor, meta.patient_id, "CLINICAL_NOTES_READ");
  const c = await q1<{ content: Buffer }>(`SELECT content FROM patient_document_content WHERE document_id=$1`, [meta.id]);
  if (!c) throw new DomainError("NOT_FOUND", "Document not found.");
  await audit(getPool(), { organizationId: actor.organizationId, actor: actor.label, action: "clinical.document.view", targetType: "patient", targetId: meta.patient_id,
    changes: { documentId: meta.id, wideAccess: actor.permissions.has("CLINICAL_RECORDS_ALL") } });
  return { fileName: meta.file_name, mimeType: meta.mime_type, content: c.content };
}

/** Take a document off the record (wrong patient, duplicate, unreadable). Kept for the audit trail, never shown again. */
export async function deleteDocument(actor: Actor, input: { documentId: string; reason: string }, correlationId: string) {
  assertPermission(actor, "CLINICAL_NOTES_WRITE");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new DomainError("VALIDATION", "Give a reason, e.g. wrong patient or duplicate.", { reason: "Required" });
  if (!/^[0-9a-f-]{36}$/i.test(input.documentId)) throw new DomainError("NOT_FOUND", "Document not found.");
  return tx(async (db) => {
    const d = await q1<{ id: string; patient_id: string }>(
      `SELECT id, patient_id FROM patient_document WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL FOR UPDATE`,
      [input.documentId, actor.organizationId], db);
    if (!d) throw new DomainError("NOT_FOUND", "Document not found.");
    await assertCareTeam(actor, d.patient_id, "CLINICAL_NOTES_WRITE", db);
    await db.query(`UPDATE patient_document SET deleted_at=now(), deleted_by=$2, delete_reason=$3 WHERE id=$1`, [d.id, actor.label, reason.slice(0, 500)]);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "clinical.document.remove", targetType: "patient", targetId: d.patient_id,
      changes: { documentId: d.id }, reason, correlationId });
  });
}
