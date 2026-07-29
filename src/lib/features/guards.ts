/**
 * Pure feature-flag business guards used by server actions and unit tests.
 * Flags never replace auth — callers must still enforce permissions.
 */

export function hasOpeningBalanceInput(data: {
  paid_through_date?: string | null;
  opening_paid_amount?: number | null;
  opening_payment_date?: string | null;
  opening_notes?: string | null;
}) {
  return Boolean(
    data.paid_through_date
    || data.opening_payment_date
    || data.opening_notes
    || (data.opening_paid_amount != null && Number(data.opening_paid_amount) !== 0),
  );
}

export function isMultiLinePayload(lines?: Array<{ line_type: string }> | null) {
  if (!lines || lines.length === 0) return false;
  if (lines.length > 1) return true;
  return lines.some((line) => line.line_type === 'service');
}

/** Block create when multi-line is disabled and the payload would create a multi-line contract. */
export function shouldBlockMultiLineCreate(
  multiLineEnabled: boolean,
  lines?: Array<{ line_type: string }> | null,
) {
  return !multiLineEnabled && isMultiLinePayload(lines);
}

/**
 * When multi-line is off: allow viewing/preserving existing multi-line contracts,
 * but block expanding them or converting a single-line contract into multi-line.
 */
export function shouldBlockMultiLineUpdate(
  multiLineEnabled: boolean,
  existingLines: Array<{ line_type: string }> | null | undefined,
  nextLines: Array<{ line_type: string }> | undefined,
) {
  if (multiLineEnabled || nextLines === undefined) return false;
  const existingIsMulti = isMultiLinePayload(existingLines);
  const nextIsMulti = isMultiLinePayload(nextLines);
  if (nextIsMulti && !existingIsMulti) return true;
  if (nextIsMulti && existingIsMulti && nextLines.length !== (existingLines?.length ?? 0)) {
    return true;
  }
  return false;
}

/** Opening-balance fields must be rejected (not silently dropped) when the flag is off. */
export function shouldBlockOpeningBalanceInput(
  openingBalanceEnabled: boolean,
  data: {
    paid_through_date?: string | null;
    opening_paid_amount?: number | null;
    opening_payment_date?: string | null;
    opening_notes?: string | null;
  },
) {
  return !openingBalanceEnabled && hasOpeningBalanceInput(data);
}

/**
 * Disabling Odoo invoice documents stops Odoo sync/UI only.
 * Local issue and payment recording remain available.
 */
export function shouldSyncIssuedInvoiceToOdoo(odooInvoicesDocumentsEnabled: boolean) {
  return odooInvoicesDocumentsEnabled;
}
