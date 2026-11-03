"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { submitBookingRequest, type BookingActionState } from "./actions";
import { formatINR } from "@/modules/billing/money";

type Branch = { id: string; name: string; responseWindow: string; timezone: string };
type Service = { id: string; name: string; durationMinutes: number; summary: string | null; price: string | null; feePolicy: string | null; billingUnit: string };
type TLink = { id: string; name: string; designation: string; serviceId: string; branchId: string };
type Slot = { startsAt: string; endsAt: string };

const STEPS = ["Service", "Time", "Your details", "Review"] as const;

function fmt(iso: string, tz: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, ...opts }).format(new Date(iso));
}

function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Accessible booking stepper (§5.1, §4.2). Clinical fields are never written to
 * browser storage; state lives in memory only. Focus moves to each step heading.
 */
export function BookingForm(props: {
  idempotencyKey: string;
  today: string;
  branches: Branch[];
  services: Service[];
  therapistLinks: TLink[];
  serviceBranches: { serviceId: string; branchId: string }[];
  initialServiceId: string | null;
  clinicPhone: string | null;
}) {
  const [step, setStep] = useState(0);
  const [branchId, setBranchId] = useState(props.branches[0].id);
  const [serviceId, setServiceId] = useState(props.services.some((s) => s.id === props.initialServiceId) ? props.initialServiceId! : "");
  const [therapistId, setTherapistId] = useState<string>("any");
  const [date, setDate] = useState(addDays(props.today, 1));
  const [slotState, setSlotState] = useState<{ key: string; slots: Slot[] | null; error: string | null }>({ key: "", slots: null, error: null });
  const [startsAt, setStartsAt] = useState("");
  const [details, setDetails] = useState({ fullName: "", phone: "", email: "", isNewPatient: "", reasonBrief: "", accessibilityNeeds: "", website: "" });
  const [privacyAck, setPrivacyAck] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<BookingActionState | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const branch = props.branches.find((b) => b.id === branchId)!;
  const tz = branch.timezone;
  const service = props.services.find((s) => s.id === serviceId);
  const servicesHere = props.services.filter((s) => props.serviceBranches.some((x) => x.serviceId === s.id && x.branchId === branchId));
  const therapists = useMemo(
    () => props.therapistLinks.filter((t) => t.serviceId === serviceId && t.branchId === branchId),
    [props.therapistLinks, serviceId, branchId],
  );
  const therapist = therapists.find((t) => t.id === therapistId);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const slotKey = `${branchId}|${serviceId}|${therapistId}|${date}`;
  const slots = slotState.key === slotKey ? slotState.slots : null;
  const slotsError = slotState.key === slotKey ? slotState.error : null;

  useEffect(() => {
    if (step !== 1 || !serviceId) return;
    let cancelled = false;
    const qs = new URLSearchParams({ branchId, serviceId, date });
    if (therapistId !== "any") qs.set("therapistId", therapistId);
    fetch(`/api/v1/public/availability?${qs}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message ?? "Could not load times");
        if (!cancelled) setSlotState({ key: slotKey, slots: j.data.slots, error: null });
      })
      .catch((e) => !cancelled && setSlotState({ key: slotKey, slots: null, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [step, branchId, serviceId, therapistId, date, slotKey]);

  function validate(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 0 && !serviceId) e.serviceId = "Choose a service";
    if (s === 1 && !startsAt) e.startsAt = "Choose a time";
    if (s === 2) {
      if (details.fullName.trim().length < 2) e.fullName = "Enter the patient's name";
      if (details.phone.replace(/\D/g, "").length < 10) e.phone = "Enter a 10-digit mobile number, e.g. 98765 43210";
      if (details.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(details.email)) e.email = "Enter a valid email address";
      if (!details.isNewPatient) e.isNewPatient = "Tell us if you have visited before";
    }
    if (s === 3 && !privacyAck) e.privacyAck = "Please confirm you have read the privacy notice";
    setErrors(e);
    if (Object.keys(e).length) requestAnimationFrame(() => summaryRef.current?.focus());
    return Object.keys(e).length === 0;
  }

  function next() {
    if (validate(step)) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function submit() {
    if (!validate(3)) return;
    startTransition(async () => {
      const r = await submitBookingRequest({
        idempotencyKey: props.idempotencyKey,
        branchId,
        serviceId,
        therapistId: therapistId === "any" ? null : therapistId,
        startsAt,
        ...details,
        privacyAck,
        marketingOptIn,
      });
      setResult(r);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        if (r.code === "SLOT_UNAVAILABLE") {
          setStartsAt("");
          setStep(1);
        }
        requestAnimationFrame(() => summaryRef.current?.focus());
      }
    });
  }

  if (result?.ok) {
    const r = result.result;
    const manageUrl = r.manageToken ? `${window.location.origin}/manage/${r.manageToken}` : null;
    return (
      <section className="card mt-8 border-[var(--color-ok)]" aria-labelledby="done-h">
        <h2 id="done-h" ref={headingRef} tabIndex={-1} className="text-2xl font-bold">Request sent — pending clinic confirmation</h2>
        <p className="mt-3">Your reference is <strong className="font-mono text-lg">{r.reference}</strong>.</p>
        <p className="mt-2">
          You asked for <strong>{fmt(r.startsAt, r.timezone, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })} (IST)</strong>.
          This is <strong>not yet a confirmed booking</strong>. The clinic will confirm or suggest another time {r.responseWindow}.
        </p>
        {manageUrl ? (
          <div className="mt-4 rounded-lg bg-[var(--color-surface-alt)] p-4">
            <p className="font-semibold">Your private link to check status or cancel</p>
            <p className="mt-1 break-all font-mono text-sm">{manageUrl}</p>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Keep this link private — anyone with it can view this request. It expires in 30 days.</p>
            <Link href={manageUrl.replace(window.location.origin, "")} className="btn btn-secondary btn-sm mt-3">Open my request</Link>
          </div>
        ) : (
          <p className="mt-4 text-sm">We already received this request. The private management link was shown the first time it was sent.</p>
        )}
        {props.clinicPhone ? <p className="mt-4">Urgent scheduling question? Call <a href={`tel:${props.clinicPhone}`}>{props.clinicPhone}</a>.</p> : null}
      </section>
    );
  }

  const errorList = Object.entries(errors);
  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_18rem]">
      <div>
        <ol className="mb-6 flex flex-wrap gap-2 text-sm" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined}
                className={`rounded-full border px-3 py-1 ${i === step ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] font-bold" : "border-[var(--color-line)]"}`}>
              {i + 1}. {s}{i < step ? " ✓" : ""}
            </li>
          ))}
        </ol>

        {(errorList.length > 0 || (result && !result.ok)) && (
          <div ref={summaryRef} tabIndex={-1} role="alert" className="mb-6 rounded-lg border-l-4 border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4">
            <p className="font-bold">{result && !result.ok ? result.error : "Please fix the following:"}</p>
            {errorList.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {errorList.map(([k, v]) => <li key={k}><a href={`#f-${k}`}>{v}</a></li>)}
              </ul>
            )}
          </div>
        )}

        <h2 ref={headingRef} tabIndex={-1} className="mb-4 text-xl font-bold">Step {step + 1} of {STEPS.length}: {STEPS[step]}</h2>

        {step === 0 && (
          <fieldset>
            <legend className="sr-only">Choose location and service</legend>
            {props.branches.length > 1 && (
              <div className="mb-4">
                <label htmlFor="f-branchId" className="field-label">Location</label>
                <select id="f-branchId" className="input" value={branchId} onChange={(e) => { setBranchId(e.target.value); setServiceId(""); setStartsAt(""); }}>
                  {props.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <p className="field-label" id="svc-label">Service</p>
            <p className="field-hint">Not sure? Choose an initial assessment — the therapist will advise.</p>
            <div role="radiogroup" aria-labelledby="svc-label" id="f-serviceId" className="grid gap-2">
              {servicesHere.map((s) => (
                <label key={s.id} className={`card flex cursor-pointer gap-3 ${serviceId === s.id ? "border-[var(--color-brand)] ring-2 ring-[var(--color-brand)]" : ""}`}>
                  <input type="radio" name="service" value={s.id} checked={serviceId === s.id}
                         onChange={() => { setServiceId(s.id); setTherapistId("any"); setStartsAt(""); }} className="mt-1 h-5 w-5" />
                  <span>
                    <span className="block font-bold">{s.name}</span>
                    <span className="block text-sm text-[var(--color-ink-muted)]">
                      About {s.durationMinutes} min · {s.price ? `${formatINR(s.price)} per ${s.billingUnit.toLowerCase()}` : (s.feePolicy ?? "Fee confirmed after assessment")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <div>
            <div className="mb-4">
              <label htmlFor="f-therapist" className="field-label">Therapist</label>
              <select id="f-therapist" className="input" value={therapistId} onChange={(e) => { setTherapistId(e.target.value); setStartsAt(""); }}>
                <option value="any">Any available therapist</option>
                {therapists.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.designation}</option>)}
              </select>
            </div>
            <div className="mb-4">
              <label htmlFor="f-date" className="field-label">Preferred date</label>
              <input id="f-date" type="date" className="input max-w-xs" value={date} min={props.today} max={addDays(props.today, 60)}
                     onChange={(e) => { setDate(e.target.value); setStartsAt(""); }} />
            </div>
            <fieldset id="f-startsAt">
              <legend className="field-label">Preferred time (IST)</legend>
              <p className="field-hint">This is a preference. The clinic confirms the final time.</p>
              <div aria-live="polite">
                {slotsError ? <p className="field-error">{slotsError}</p> : slots === null ? <p>Loading available times…</p> : slots.length === 0 ? (
                  <p>No times available on this date. Try another date{props.clinicPhone ? <>, or call <a href={`tel:${props.clinicPhone}`}>{props.clinicPhone}</a> to ask for a callback</> : ""}.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((s) => (
                      <label key={s.startsAt} className={`btn btn-sm ${startsAt === s.startsAt ? "btn-primary" : "btn-secondary"}`}>
                        <input type="radio" name="slot" className="sr-only" value={s.startsAt} checked={startsAt === s.startsAt} onChange={() => setStartsAt(s.startsAt)} />
                        {fmt(s.startsAt, tz, { hour: "numeric", minute: "2-digit" })}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </fieldset>
          </div>
        )}

        {step === 2 && (
          <div>
            {([
              ["fullName", "Patient's full name", "text", "name", undefined],
              ["phone", "Mobile number", "tel", "tel", "We use this to confirm your appointment. Indian numbers can be entered without +91."],
              ["email", "Email (optional)", "email", "email", undefined],
            ] as const).map(([k, label, type, ac, hint]) => (
              <div key={k} className="mb-4">
                <label htmlFor={`f-${k}`} className="field-label">{label}</label>
                {hint ? <span id={`f-${k}-hint`} className="field-hint">{hint}</span> : null}
                <input id={`f-${k}`} type={type} autoComplete={ac} className="input" value={details[k]}
                       inputMode={k === "phone" ? "tel" : undefined}
                       aria-invalid={!!errors[k]} aria-describedby={[hint ? `f-${k}-hint` : "", errors[k] ? `f-${k}-err` : ""].join(" ").trim() || undefined}
                       onChange={(e) => setDetails({ ...details, [k]: e.target.value })} />
                {errors[k] ? <span id={`f-${k}-err`} className="field-error">{errors[k]}</span> : null}
              </div>
            ))}
            <fieldset className="mb-4" id="f-isNewPatient">
              <legend className="field-label">Have you visited this clinic before?</legend>
              {[["yes", "No, this is my first visit"], ["no", "Yes, I have visited before"], ["unsure", "Not sure"]].map(([v, l]) => (
                <label key={v} className="flex min-h-11 items-center gap-2">
                  <input type="radio" name="isNew" value={v} checked={details.isNewPatient === v} onChange={() => setDetails({ ...details, isNewPatient: v })} className="h-5 w-5" /> {l}
                </label>
              ))}
              {errors.isNewPatient ? <span className="field-error">{errors.isNewPatient}</span> : null}
            </fieldset>
            <div className="mb-4">
              <label htmlFor="f-reasonBrief" className="field-label">Reason for visit (optional, brief)</label>
              <span className="field-hint">One line is enough, e.g. “knee pain after running”. Detailed history is collected securely later.</span>
              <input id="f-reasonBrief" className="input" maxLength={200} value={details.reasonBrief} onChange={(e) => setDetails({ ...details, reasonBrief: e.target.value })} />
            </div>
            <div className="mb-4">
              <label htmlFor="f-accessibilityNeeds" className="field-label">Any access or assistance needs? (optional)</label>
              <input id="f-accessibilityNeeds" className="input" maxLength={200} value={details.accessibilityNeeds} onChange={(e) => setDetails({ ...details, accessibilityNeeds: e.target.value })} />
            </div>
            {/* Honeypot: hidden from people and assistive tech */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>Website<input tabIndex={-1} autoComplete="off" value={details.website} onChange={(e) => setDetails({ ...details, website: e.target.value })} /></label>
            </div>
          </div>
        )}

        {step === 3 && service && (
          <div>
            <dl className="card grid gap-3 sm:grid-cols-2">
              <div><dt className="font-semibold">Service</dt><dd>{service.name}</dd></div>
              <div><dt className="font-semibold">Location</dt><dd>{branch.name}</dd></div>
              <div><dt className="font-semibold">Therapist</dt><dd>{therapist ? therapist.name : "Any available"}</dd></div>
              <div><dt className="font-semibold">Preferred time</dt><dd>{fmt(startsAt, tz, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })} IST</dd></div>
              <div><dt className="font-semibold">Estimated duration</dt><dd>About {service.durationMinutes} minutes</dd></div>
              <div><dt className="font-semibold">Fee</dt><dd>{service.price ? `${formatINR(service.price)} per ${service.billingUnit.toLowerCase()}` : (service.feePolicy ?? "Confirmed after assessment")}</dd></div>
              <div><dt className="font-semibold">Patient</dt><dd>{details.fullName}</dd></div>
              <div><dt className="font-semibold">Contact</dt><dd>{details.phone}{details.email ? `, ${details.email}` : ""}</dd></div>
            </dl>
            <p className="mt-4 text-sm">
              This is an <strong>appointment request pending clinic confirmation</strong>. See the <Link href="/cancellation-refunds">cancellation policy</Link>.
            </p>
            <label className="mt-4 flex items-start gap-3" id="f-privacyAck">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={privacyAck} onChange={(e) => setPrivacyAck(e.target.checked)} aria-invalid={!!errors.privacyAck} />
              <span>I have read the <Link href="/privacy" target="_blank">privacy notice</Link> and agree to the clinic contacting me about this request.</span>
            </label>
            {errors.privacyAck ? <span className="field-error">{errors.privacyAck}</span> : null}
            <label className="mt-3 flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} />
              <span>Optional: send me occasional clinic updates. (You can say no and still book.)</span>
            </label>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          {step > 0 && <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)} disabled={pending}>Back</button>}
          {step < 3 ? (
            <button type="button" className="btn btn-primary" onClick={next}>Continue</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={submit} disabled={pending} aria-disabled={pending}>
              {pending ? "Sending request…" : "Send appointment request"}
            </button>
          )}
        </div>
      </div>

      <aside aria-label="Summary" className="hidden lg:block">
        <div className="card sticky top-24 text-sm">
          <p className="font-bold">Your request</p>
          <p className="mt-2">{service?.name ?? "No service chosen"}</p>
          <p>{therapist ? therapist.name : "Any available therapist"}</p>
          <p>{startsAt ? `${fmt(startsAt, tz, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} IST` : "No time chosen"}</p>
          <p className="mt-2 text-[var(--color-ink-muted)]">Pending clinic confirmation.</p>
        </div>
      </aside>
    </div>
  );
}
