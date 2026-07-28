/**
 * Saudi national ID / Iqama checksum (10 digits, type 1 or 2).
 * Empty/null is treated as absent (valid when optional).
 */
export function isValidSaudiNationalId(value: string | null | undefined): boolean {
  if (value == null) return true;
  const id = value.trim();
  if (!id) return true;
  if (!/^[12]\d{9}$/.test(id)) return false;

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    if (i % 2 === 0) {
      const doubled = String(Number(id[i]) * 2).padStart(2, '0');
      sum += Number(doubled[0]) + Number(doubled[1]);
    } else {
      sum += Number(id[i]);
    }
  }
  return sum % 10 === 0;
}

export function normalizeNationalId(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
