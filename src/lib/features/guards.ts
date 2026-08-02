/**
 * Pure feature-flag business guards used by server actions and unit tests.
 * Flags never replace auth — callers must still enforce permissions.
 */

import type { InvoiceStatus, OdooSyncStatus } from '@/types/database';
import type { OdooInvoiceSendVisibleStatus } from '@/lib/odoo/invoice-send-settings';

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
 * When issuing a local invoice, Odoo draft sync / prechecks run only if the
 * invoices-documents feature flag is on. Local issue still works when it is off.
 */
export function shouldSyncIssuedInvoiceToOdoo(odooInvoicesDocumentsEnabled: boolean) {
  return Boolean(odooInvoicesDocumentsEnabled);
}

/**
 * Manual Send to Odoo is available only when both the documents feature and the
 * dedicated manual-send flag are on. Local issue/payment stay available either way.
 */
export function shouldAllowManualOdooInvoiceSend(
  odooInvoicesDocumentsEnabled: boolean,
  odooInvoiceManualSendEnabled: boolean,
) {
  return odooInvoicesDocumentsEnabled && odooInvoiceManualSendEnabled;
}

/**
 * UI + server gate for the Send to Odoo button.
 * Auth (`odoo.manage`) must still be enforced separately by the caller.
 */
export function shouldShowOdooInvoiceSendButton(input: {
  odooDocumentsEnabled: boolean;
  manualSendEnabled: boolean;
  canManageOdoo: boolean;
  odooIntegrationEnabled: boolean;
  visibleStatus: OdooInvoiceSendVisibleStatus;
  invoice: {
    status: InvoiceStatus;
    odoo_invoice_id: number | null;
    odoo_sync_status: OdooSyncStatus | null;
    odoo_sync_error: string | null;
  };
}) {
  if (
    !shouldAllowManualOdooInvoiceSend(input.odooDocumentsEnabled, input.manualSendEnabled)
    || !input.canManageOdoo
    || !input.odooIntegrationEnabled
  ) {
    return false;
  }
  if (input.invoice.status !== input.visibleStatus) return false;
  // Already linked successfully — operators use status check instead.
  if (input.invoice.odoo_sync_status === 'synced' && input.invoice.odoo_invoice_id) {
    return false;
  }
  // Mapping/review issues must be resolved in the import center before another send.
  if (input.invoice.odoo_sync_status === 'needs_review') {
    return false;
  }
  return true;
}

/**
 * Status check is independent of the manual-send flag so operators can still
 * refresh Odoo state for invoices that were already linked.
 */
export function shouldShowOdooInvoiceStatusCheckButton(input: {
  odooDocumentsEnabled: boolean;
  canManageOdoo: boolean;
  invoice: {
    odoo_invoice_id: number | null;
    odoo_sync_error: string | null;
  };
}) {
  return Boolean(
    input.odooDocumentsEnabled
    && input.canManageOdoo
    && input.invoice.odoo_invoice_id
    && input.invoice.odoo_sync_error !== 'odooInvoiceNotFound',
  );
}
