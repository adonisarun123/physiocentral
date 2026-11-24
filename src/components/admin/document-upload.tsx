"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOCUMENT_KINDS, MAX_DOCUMENT_BYTES } from "@/modules/patients/document-rules";

const MAX_MB = MAX_DOCUMENT_BYTES / 1024 / 1024;
const MAX_EDGE = 2400; // px: plenty for reading a report or film photo

/** Shrink a large photo in the browser (JPEG, longest side 2400 px) so phone pictures fit under the limit. */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= MAX_DOCUMENT_BYTES * 0.9) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (blob && blob.size <= MAX_DOCUMENT_BYTES) return new File([blob], file.name.replace(/\.[^.]*$/, "") + ".jpg", { type: "image/jpeg" });
  }
  return file;
}

export function DocumentUpload({ patientId, idPrefix = "doc" }: { patientId: string; idPrefix?: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const msg = useRef<HTMLParagraphElement>(null);
  const [state, setState] = useState<{ busy: boolean; error?: string; ok?: string }>({ busy: false });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const picked = fd.get("file");
    if (!(picked instanceof File) || picked.size === 0) return setState({ busy: false, error: "Choose a file." });
    setState({ busy: true });
    try {
      const file = await shrinkImage(picked);
      if (file.size > MAX_DOCUMENT_BYTES) {
        setState({ busy: false, error: `The file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_MB} MB. For a PDF, save a compressed copy or upload the key pages.` });
        msg.current?.focus();
        return;
      }
      fd.set("file", file, file.name);
      fd.set("patientId", patientId);
      const res = await fetch("/admin/documents/upload", { method: "POST", body: fd });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const fe = body?.error?.fieldErrors ? Object.values(body.error.fieldErrors).join(" · ") : "";
        setState({ busy: false, error: `${body?.error?.message ?? "Upload failed."}${fe ? ` ${fe}` : ""}` });
        msg.current?.focus();
        return;
      }
      form.current?.reset();
      setState({ busy: false, ok: "Uploaded." });
      router.refresh();
    } catch {
      setState({ busy: false, error: "Upload failed. Check the connection and try again." });
      msg.current?.focus();
    }
  }

  return (
    <form ref={form} onSubmit={onSubmit} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="field-label" htmlFor={`${idPrefix}-k`}>Type</label>
          <select id={`${idPrefix}-k`} name="kind" required defaultValue="" className="input">
            <option value="" disabled>Choose…</option>
            {DOCUMENT_KINDS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div><label className="field-label" htmlFor={`${idPrefix}-t`}>Name</label>
          <input id={`${idPrefix}-t`} name="title" required minLength={2} maxLength={120} className="input" placeholder="e.g. Lumbar spine MRI report" /></div>
        <div><label className="field-label" htmlFor={`${idPrefix}-d`}>Date on the report (optional)</label>
          <input id={`${idPrefix}-d`} name="documentDate" type="date" className="input" /></div>
        <div><label className="field-label" htmlFor={`${idPrefix}-f`}>File (PDF or photo, up to {MAX_MB} MB)</label>
          <input id={`${idPrefix}-f`} name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="input" /></div>
      </div>
      <p className="field-hint">Large photos are shrunk automatically before upload. DICOM files from scan CDs can&apos;t be uploaded; use the printed report or a photo of the film.</p>
      <div aria-live="polite">
        {state.error ? <p ref={msg} tabIndex={-1} className="field-error">{state.error}</p> : null}
        {state.ok ? <p className="font-semibold text-[var(--color-ok)]">{state.ok}</p> : null}
      </div>
      <div><button type="submit" className="btn btn-primary btn-sm" disabled={state.busy} aria-disabled={state.busy}>{state.busy ? "Uploading…" : "Upload"}</button></div>
    </form>
  );
}
