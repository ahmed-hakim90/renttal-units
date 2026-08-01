export const ODOO_INVOICE_NOT_FOUND_ERROR = 'odooInvoiceNotFound';

export function isOdooInvoiceDeleted(invoice: { odoo_sync_error: string | null }) {
  return invoice.odoo_sync_error === ODOO_INVOICE_NOT_FOUND_ERROR;
}
