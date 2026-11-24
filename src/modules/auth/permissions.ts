/**
 * Action-based permissions (§2.1). Roles are presets mapping to permission sets;
 * components and services check permissions, never role strings.
 * Note: OWNER does not imply clinical-note access (no CLINICAL_NOTES_READ).
 * CLINICAL_LEAD adds CLINICAL_RECORDS_ALL: every patient's clinical record, not
 * only the patients on the holder's care team, plus the audit history.
 * PAYMENT_REFUND is held by the front desk as well as the owner: the clinic lets
 * either approve a refund, and every refund records who approved it.
 * DOCUMENT_UPLOAD lets reception scan in a patient's reports without being able
 * to open them afterwards: opening a document needs clinical-record access.
 * EXPENSE_RECORD covers entering clinic spending (front desk petty cash too);
 * voiding an expense also needs FINANCE_VIEW.
 */
export const PERMISSIONS = [
  "APPOINTMENT_VIEW",
  "APPOINTMENT_ACCEPT",
  "APPOINTMENT_TRANSITION",
  "APPOINTMENT_CANCEL",
  "PATIENT_CONTACT_VIEW",
  "CLINICAL_NOTES_READ",
  "CLINICAL_NOTES_WRITE",
  "CLINICAL_RECORDS_ALL",
  "BILLABLE_PROPOSE",
  "CATALOG_MANAGE",
  "PRICE_MANAGE",
  "ESTIMATE_MANAGE",
  "ESTIMATE_RECORD_OFFLINE_APPROVAL",
  "INVOICE_DRAFT",
  "INVOICE_ISSUE",
  "PAYMENT_RECORD",
  "PAYMENT_VERIFY",
  "PAYMENT_ALLOCATE",
  "PAYMENT_REFUND",
  "FINANCE_VIEW",
  "TAX_CONFIGURE",
  "SETTINGS_MANAGE",
  "USERS_MANAGE",
  "AUDIT_VIEW",
  "DOCUMENT_UPLOAD",
  "EXPENSE_RECORD",
  "PAYMENT_REMIND",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["OWNER", "CLINIC_ADMIN", "RECEPTIONIST", "PHYSIOTHERAPIST", "BILLING", "ACCOUNTANT", "CONTENT_EDITOR", "CLINICAL_LEAD"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_PRESETS: Record<Role, readonly Permission[]> = {
  OWNER: [
    "APPOINTMENT_VIEW", "APPOINTMENT_ACCEPT", "APPOINTMENT_TRANSITION", "APPOINTMENT_CANCEL",
    "PATIENT_CONTACT_VIEW", "CATALOG_MANAGE", "PRICE_MANAGE", "ESTIMATE_MANAGE",
    "ESTIMATE_RECORD_OFFLINE_APPROVAL", "INVOICE_DRAFT", "INVOICE_ISSUE", "PAYMENT_RECORD",
    "PAYMENT_VERIFY", "PAYMENT_ALLOCATE", "PAYMENT_REFUND", "FINANCE_VIEW", "SETTINGS_MANAGE", "USERS_MANAGE", "AUDIT_VIEW",
    "DOCUMENT_UPLOAD", "EXPENSE_RECORD", "PAYMENT_REMIND",
  ],
  CLINIC_ADMIN: [
    "APPOINTMENT_VIEW", "APPOINTMENT_ACCEPT", "APPOINTMENT_TRANSITION", "APPOINTMENT_CANCEL",
    "PATIENT_CONTACT_VIEW", "CATALOG_MANAGE", "ESTIMATE_MANAGE", "ESTIMATE_RECORD_OFFLINE_APPROVAL",
    "INVOICE_DRAFT", "PAYMENT_RECORD", "PAYMENT_REFUND", "SETTINGS_MANAGE",
    "DOCUMENT_UPLOAD", "EXPENSE_RECORD", "PAYMENT_REMIND",
  ],
  RECEPTIONIST: [
    "APPOINTMENT_VIEW", "APPOINTMENT_ACCEPT", "APPOINTMENT_TRANSITION", "APPOINTMENT_CANCEL",
    "PATIENT_CONTACT_VIEW", "INVOICE_DRAFT", "PAYMENT_RECORD", "PAYMENT_REFUND",
    "DOCUMENT_UPLOAD", "EXPENSE_RECORD", "PAYMENT_REMIND",
  ],
  PHYSIOTHERAPIST: [
    "APPOINTMENT_VIEW", "APPOINTMENT_TRANSITION", "CLINICAL_NOTES_READ", "CLINICAL_NOTES_WRITE",
    "BILLABLE_PROPOSE", "ESTIMATE_MANAGE", "DOCUMENT_UPLOAD",
  ],
  BILLING: [
    "APPOINTMENT_VIEW", "PATIENT_CONTACT_VIEW", "ESTIMATE_MANAGE", "ESTIMATE_RECORD_OFFLINE_APPROVAL",
    "INVOICE_DRAFT", "INVOICE_ISSUE", "PAYMENT_RECORD", "PAYMENT_VERIFY", "PAYMENT_ALLOCATE", "PAYMENT_REFUND", "FINANCE_VIEW",
    "EXPENSE_RECORD", "PAYMENT_REMIND",
  ],
  ACCOUNTANT: ["FINANCE_VIEW", "TAX_CONFIGURE", "AUDIT_VIEW", "PRICE_MANAGE", "EXPENSE_RECORD"],
  CONTENT_EDITOR: ["CATALOG_MANAGE"],
  CLINICAL_LEAD: ["CLINICAL_NOTES_READ", "CLINICAL_NOTES_WRITE", "CLINICAL_RECORDS_ALL", "AUDIT_VIEW", "DOCUMENT_UPLOAD"],
};

export function permissionsFor(roles: readonly string[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) {
    const preset = ROLE_PRESETS[r as Role];
    if (preset) preset.forEach((p) => set.add(p));
  }
  return set;
}
