import { ActionForm, SubmitButton } from "@/components/action-form";
import { todayInZone } from "@/lib/format";
import { formatINR } from "@/modules/billing/money";
import { recordPaymentAction } from "@/app/(staff)/admin/actions";

export function PaymentForm({ patientId, invoices, canVerify, defaultInvoiceId, defaultAmount }: {
  patientId: string; canVerify: boolean; defaultInvoiceId?: string; defaultAmount?: string;
  invoices: { id: string; number: string; due_paise: string }[];
}) {
  return (
    <ActionForm action={recordPaymentAction} className="mt-3">
      <input type="hidden" name="patientId" value={patientId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="field-label" htmlFor="pf-a">Amount (₹)</label><input id="pf-a" name="amountRupees" required className="input" inputMode="decimal" defaultValue={defaultAmount} /></div>
        <div><label className="field-label" htmlFor="pf-m">Method</label>
          <select id="pf-m" name="method" className="input"><option value="CASH">Cash</option><option value="UPI_MANUAL">UPI</option><option value="BANK_TRANSFER">Bank transfer</option></select></div>
        <div><label className="field-label" htmlFor="pf-d">Date received</label><input id="pf-d" name="receivedOn" type="date" required className="input" defaultValue={todayInZone()} /></div>
        <div><label className="field-label" htmlFor="pf-acct">Received into</label><input id="pf-acct" name="receivingAccount" required className="input" defaultValue="Front desk" /></div>
        <div><label className="field-label" htmlFor="pf-r">UTR / reference (UPI &amp; bank)</label><input id="pf-r" name="reference" className="input" /></div>
        <div><label className="field-label" htmlFor="pf-i">Apply to invoice</label>
          <select id="pf-i" name="invoiceId" defaultValue={defaultInvoiceId ?? ""} className="input">
            <option value="">Keep as advance / credit</option>
            {invoices.map((i) => <option key={i.id} value={i.id}>{i.number} — {formatINR(i.due_paise)} due</option>)}
          </select></div>
        <div className="sm:col-span-2"><label className="field-label" htmlFor="pf-n">Note</label><input id="pf-n" name="note" className="input" /></div>
      </div>
      {canVerify ? (
        <label className="mt-3 flex items-center gap-2"><input type="checkbox" name="verifyNow" defaultChecked className="h-5 w-5" /> Money received — issue a receipt now (and apply to the invoice chosen)</label>
      ) : <p className="mt-3 text-sm">Saved as <strong>pending</strong> until a verifier confirms the money arrived.</p>}
      <div className="mt-3"><SubmitButton>Record payment</SubmitButton></div>
    </ActionForm>
  );
}
