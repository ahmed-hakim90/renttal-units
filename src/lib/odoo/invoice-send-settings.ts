import type { InvoiceStatus } from '@/types/database';

export const ODOO_INVOICE_SEND_VISIBLE_STATUSES = [
  'due',
  'invoice_issued',
  'partially_paid',
  'fully_paid',
  'overdue',
] as const satisfies readonly InvoiceStatus[];

export type OdooInvoiceSendVisibleStatus = typeof ODOO_INVOICE_SEND_VISIBLE_STATUSES[number];

export function isOdooInvoiceSendVisibleStatus(value: unknown): value is OdooInvoiceSendVisibleStatus {
  return typeof value === 'string'
    && (ODOO_INVOICE_SEND_VISIBLE_STATUSES as readonly string[]).includes(value);
}
