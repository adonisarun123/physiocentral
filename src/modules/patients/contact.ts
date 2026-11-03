/**
 * Normalise a phone number to E.164. Defaults to India (+91) for 10-digit
 * national numbers. Returns null when it cannot be a valid number.
 * Server-side validation; numeric keyboards on the client are a convenience only.
 */
export function normalizeIndianPhone(input: string): string | null {
  const trimmed = input.trim();
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (plus) {
    if (digits.length < 8 || digits.length > 15) return null;
    if (digits.startsWith("91") && !/^91[6-9]\d{9}$/.test(digits)) return null;
    return `+${digits}`;
  }
  let national = digits;
  if (national.length === 11 && national.startsWith("0")) national = national.slice(1);
  if (national.length === 12 && national.startsWith("91")) national = national.slice(2);
  if (/^[6-9]\d{9}$/.test(national)) return `+91${national}`;
  return null;
}

/** Mask for safe display in lists: +91 98•••••210 */
export function maskPhone(e164: string): string {
  if (e164.length < 8) return "•••";
  return `${e164.slice(0, 5)}•••••${e164.slice(-3)}`;
}
