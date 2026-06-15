'use server';

import { requireAuth, requireAdminEditor } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { invoiceService } from '@/lib/services/invoice-service';
import { paymentService } from '@/lib/services/payment-service';
import { rentalService } from '@/lib/services/rental-service';
import { revalidatePath } from 'next/cache';
import type { InvoiceStatus, PaymentMethod } from '@/types/database';

async function getCtx() {
  return { correlation_id: await getCorrelationId() };
}

export async function getInvoices(locale: string, filters?: { status?: InvoiceStatus | InvoiceStatus[]; locationId?: string }) {
  const auth = await requireAuth(locale, await getCtx());
  return invoiceService.list(auth, { ...await getCtx(), user_id: auth.userId, role: auth.role }, filters);
}

export async function getDashboardStats(locale: string) {
  const auth = await requireAuth(locale, await getCtx());
  return invoiceService.getDashboardCounts(auth, { ...await getCtx(), user_id: auth.userId, role: auth.role });
}

export async function issueInvoice(locale: string, data: {
  invoice_number: string;
  unit_id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  notes?: string;
}) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const result = await invoiceService.issueInvoice(auth, data, { ...await getCtx(), user_id: auth.userId, role: auth.role });
  if (result.success) {
    revalidatePath(`/${locale}/invoices`);
    revalidatePath(`/${locale}/dashboard`);
  }
  return result;
}

export async function getDueThisMonth(locale: string) {
  const auth = await requireAuth(locale, await getCtx());
  return rentalService.getDueThisMonth(auth, { ...await getCtx(), user_id: auth.userId, role: auth.role });
}

export async function syncDueInvoices(locale: string) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const result = await rentalService.generateDueInvoices(auth, { ...await getCtx(), user_id: auth.userId, role: auth.role });
  if (result.success) {
    revalidatePath(`/${locale}/due-this-month`);
    revalidatePath(`/${locale}/dashboard`);
    revalidatePath(`/${locale}/invoices`);
    revalidatePath(`/${locale}/reports/debt-aging`);
  }
  return result;
}

export async function issueDueInvoice(locale: string, invoiceId: string, invoiceNumber: string) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const result = await invoiceService.issueDueInvoice(auth, invoiceId, invoiceNumber, { ...await getCtx(), user_id: auth.userId, role: auth.role });
  if (result.success) {
    revalidatePath(`/${locale}/due-this-month`);
    revalidatePath(`/${locale}/invoices`);
    revalidatePath(`/${locale}/dashboard`);
  }
  return result;
}

export async function recordPayment(locale: string, data: {
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  reference_number?: string;
  notes?: string;
}) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const result = await paymentService.recordPayment(auth, data, { ...await getCtx(), user_id: auth.userId, role: auth.role });
  if (result.success) {
    revalidatePath(`/${locale}/payments`);
    revalidatePath(`/${locale}/invoices`);
    revalidatePath(`/${locale}/partial-payments`);
    revalidatePath(`/${locale}/fully-paid`);
    revalidatePath(`/${locale}/dashboard`);
  }
  return result;
}

export async function getPayments(locale: string, filters?: { invoiceId?: string }) {
  const auth = await requireAuth(locale, await getCtx());
  return paymentService.list(auth, { ...await getCtx(), user_id: auth.userId, role: auth.role }, filters);
}
