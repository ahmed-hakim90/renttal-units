import type { AuthContext, Invoice, InvoiceStatus, ServiceResult } from '@/types/database';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { auditService } from './audit-service';
import { validationService } from './validation-service';
import { withSpan, type LogContext } from '@/lib/observability';
import { unitsRepository } from '@/lib/repositories/units';
import { rentalService } from './rental-service';

export function computeInvoiceStatus(amount: number, paidAmount: number, dueDate: string, currentStatus: InvoiceStatus): InvoiceStatus {
  if (paidAmount >= amount) return 'fully_paid';
  if (paidAmount > 0) {
    const today = new Date().toISOString().split('T')[0];
    if (dueDate < today) return 'overdue';
    return 'partially_paid';
  }
  if (currentStatus === 'invoice_issued') {
    const today = new Date().toISOString().split('T')[0];
    if (dueDate < today) return 'overdue';
    return 'invoice_issued';
  }
  return currentStatus;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function mapIssueDueInvoiceError(error: unknown): ServiceResult<Invoice> {
  const message = getErrorMessage(error);
  if (message.includes('FORBIDDEN')) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };
  if (message.includes('INVOICE_NOT_FOUND')) return { success: false, error: 'Invoice not found', errorCode: 'NOT_FOUND' };
  if (message.includes('INVOICE_NUMBER_REQUIRED')) return { success: false, error: 'invoiceNumberRequired', errorCode: 'VALIDATION' };
  if (message.includes('DUPLICATE_NUMBER')) return { success: false, error: 'duplicateNumber', errorCode: 'DUPLICATE_NUMBER' };
  if (message.includes('INVALID_INVOICE_STATUS')) return { success: false, error: 'invalidInvoiceStatus', errorCode: 'VALIDATION' };
  throw error;
}

export const invoiceService = {
  async list(auth: AuthContext, ctx: LogContext, filters?: { status?: InvoiceStatus | InvoiceStatus[]; locationId?: string }) {
    return invoicesRepository.findAll(ctx, filters);
  },

  async getById(auth: AuthContext, id: string, ctx: LogContext) {
    return invoicesRepository.findById(id, ctx);
  },

  async issueInvoice(
    auth: AuthContext,
    input: {
      invoice_number: string;
      unit_id: string;
      period_start: string;
      period_end: string;
      due_date: string;
      notes?: string;
    },
    ctx: LogContext
  ): Promise<ServiceResult<Invoice>> {
    if (!auth.isAdminEditor) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };

    return withSpan('invoiceService.issueInvoice', { ...ctx, service: 'invoice', user_id: auth.userId }, async () => {
      const validation = validationService.validateInvoice(input);
      if (!validation.valid) return { success: false, error: validation.errors.join(', '), errorCode: 'VALIDATION' };

      const existingNumber = await invoicesRepository.findByInvoiceNumber(input.invoice_number, ctx);
      if (existingNumber) return { success: false, error: 'duplicateNumber', errorCode: 'DUPLICATE_NUMBER' };

      const existingPeriod = await invoicesRepository.findByUnitAndPeriod(input.unit_id, input.period_start, input.period_end, ctx);
      if (existingPeriod) return { success: false, error: 'duplicatePeriod', errorCode: 'DUPLICATE_PERIOD' };

      const unit = await unitsRepository.findById(input.unit_id, ctx);
      if (!unit) return { success: false, error: 'Unit not found', errorCode: 'NOT_FOUND' };

      if (unit.rent_start_date && input.period_start < unit.rent_start_date) {
        return { success: false, error: 'periodBeforeRentStart', errorCode: 'VALIDATION' };
      }

      if (unit.rent_end_date && input.period_end > unit.rent_end_date) {
        return { success: false, error: 'periodAfterRentEnd', errorCode: 'VALIDATION' };
      }

      const amount = rentalService.calculatePeriodAmount(Number(unit.monthly_rent), unit.payment_cycle);

      const invoice = await invoicesRepository.create({
        invoice_number: input.invoice_number,
        unit_id: input.unit_id,
        tenant_id: unit.tenant_id,
        period_start: input.period_start,
        period_end: input.period_end,
        amount,
        paid_amount: 0,
        status: 'invoice_issued',
        due_date: input.due_date,
        issued_at: new Date().toISOString(),
        notes: input.notes ?? null,
      }, ctx);

      await auditService.log(auth, 'create', 'invoice', invoice.id, null, invoice, ctx);
      return { success: true, data: invoice };
    });
  },

  async issueDueInvoice(
    auth: AuthContext,
    id: string,
    invoiceNumber: string,
    ctx: LogContext
  ): Promise<ServiceResult<Invoice>> {
    if (!auth.isAdminEditor) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };
    if (!invoiceNumber.trim()) return { success: false, error: 'invoiceNumberRequired', errorCode: 'VALIDATION' };

    return withSpan('invoiceService.issueDueInvoice', { ...ctx, service: 'invoice', user_id: auth.userId }, async () => {
      const old = await invoicesRepository.findById(id, ctx);
      if (!old) return { success: false, error: 'Invoice not found', errorCode: 'NOT_FOUND' };

      let invoice: Invoice;
      try {
        invoice = await invoicesRepository.issueDueInvoice(id, invoiceNumber, ctx);
      } catch (error) {
        return mapIssueDueInvoiceError(error);
      }

      await auditService.log(
        auth,
        'issue_invoice',
        'invoice',
        id,
        { invoice_number: old.invoice_number, status: old.status, issued_at: old.issued_at },
        { invoice_number: invoice.invoice_number, status: invoice.status, issued_at: invoice.issued_at },
        ctx
      );

      return { success: true, data: invoice };
    });
  },

  async updateStatus(auth: AuthContext, id: string, ctx: LogContext): Promise<ServiceResult<Invoice>> {
    if (!auth.isAdminEditor) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };

    const invoice = await invoicesRepository.findById(id, ctx);
    if (!invoice) return { success: false, error: 'Not found', errorCode: 'NOT_FOUND' };

    const newStatus = computeInvoiceStatus(Number(invoice.amount), Number(invoice.paid_amount), invoice.due_date, invoice.status);
    if (newStatus === invoice.status) return { success: true, data: invoice };

    const updated = await invoicesRepository.update(id, { status: newStatus }, ctx);
    await auditService.log(auth, 'update_status', 'invoice', id, { status: invoice.status }, { status: newStatus }, ctx);
    return { success: true, data: updated };
  },

  async getDashboardCounts(auth: AuthContext, ctx: LogContext) {
    const [dueThisMonth, awaitingPayment, partialPayments, fullyPaid] = await Promise.all([
      invoicesRepository.findDueThisMonth(ctx).then((r) => r.length),
      invoicesRepository.countByStatus('invoice_issued', ctx),
      invoicesRepository.countByStatus('partially_paid', ctx),
      invoicesRepository.countByStatus('fully_paid', ctx),
    ]);
    return { dueThisMonth, awaitingPayment, partialPayments, fullyPaid };
  },
};
