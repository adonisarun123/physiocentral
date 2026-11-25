import { q1 } from "@/lib/db";
import { displayPhone } from "@/lib/format";

/**
 * Branded letterhead and footer shared by every printed document (bills,
 * receipts, refund vouchers, exercise sheets). Colours come from the logo:
 * navy band (#002552) with the logo's blue / orange / green as a stripe.
 *
 * Contact details are read live from the clinic's main branch. They are
 * letterhead, not document data: the figures on a bill or receipt still come
 * only from its immutable snapshot (§9.2).
 */
export type ClinicContact = { name: string; address: string | null; phone: string | null; email: string | null };

export async function getClinicContact(organizationId: string): Promise<ClinicContact> {
  const row = await q1<ClinicContact>(
    `SELECT o.trade_name AS name, COALESCE(b.phone_e164, o.phone_e164) AS phone, o.email,
            NULLIF(concat_ws(', ', b.address_line, b.locality, concat_ws(' ', b.city, b.postal_code)), '') AS address
       FROM organization o
       LEFT JOIN LATERAL (SELECT * FROM branch WHERE organization_id=o.id ORDER BY public DESC, created_at LIMIT 1) b ON true
      WHERE o.id=$1`, [organizationId]);
  return row ?? { name: "Physio Central", address: null, phone: null, email: null };
}

const WEBSITE = "www.physiocentral.in";

/** "Physio Central by Dr Nitin Sunku" → ["Physio Central", "by Dr Nitin Sunku"] */
function splitName(name: string): [string, string | null] {
  const i = name.indexOf(" by ");
  return i > 0 ? [name.slice(0, i), name.slice(i + 1)] : [name, null];
}

export function Letterhead({ clinic, extra }: { clinic: ClinicContact; extra?: React.ReactNode }) {
  const [brand, by] = splitName(clinic.name);
  return (
    <header className="pd-head">
      <div className="pd-band">
        <div className="pd-logo">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, must render in print */}
          <img src="/brand/logo-mark.svg" alt="" width={46} height={56} />
        </div>
        <div className="pd-brand">
          <p className="pd-name">{brand}</p>
          {by ? <p className="pd-by">{by}</p> : null}
          <p className="pd-tag">Physiotherapy &amp; Rehabilitation</p>
        </div>
        <div className="pd-contact">
          {clinic.address ? <p>{clinic.address}</p> : null}
          <p>{[clinic.phone ? displayPhone(clinic.phone) : null, clinic.email].filter(Boolean).join(" · ")}</p>
          <p>{WEBSITE}</p>
          {extra}
        </div>
      </div>
      <div className="pd-stripe" aria-hidden="true"><span /><span /><span /></div>
    </header>
  );
}

export function DocTitle({ title, number, date, stamp }: { title: string; number?: string; date?: string; stamp?: { text: string; tone: "paid" | "part" | "due" | "void" } | null }) {
  return (
    <div className="pd-titlerow">
      <div>
        <h1 className="pd-title">{title}</h1>
        {number || date ? <p className="pd-docmeta">{number ? <>No. <strong>{number}</strong></> : null}{number && date ? " · " : null}{date}</p> : null}
      </div>
      {stamp ? <span className={`pd-stamp pd-stamp-${stamp.tone}`}>{stamp.text}</span> : null}
    </div>
  );
}

export function Signature({ clinicName, left }: { clinicName: string; left?: string }) {
  const [brand] = splitName(clinicName);
  return (
    <div className="pd-sign">
      <p className="pd-thanks">{left ?? `Thank you for choosing ${brand}. Wishing you a smooth and steady recovery.`}</p>
      <div className="pd-signbox"><span className="pd-signline" />Authorised signatory<br />For {brand}</div>
    </div>
  );
}

export function PrintFooter({ clinic, note }: { clinic: ClinicContact; note?: string }) {
  return (
    <footer className="pd-foot">
      <span>{note ?? "This is a computer-generated document."}</span>
      <span>{[clinic.phone ? displayPhone(clinic.phone) : null, WEBSITE].filter(Boolean).join(" · ")}</span>
    </footer>
  );
}
