import type { AuthContext, Payment, PaymentMethod, ServiceResult } from '@/types/database';
import { paymentsRepository } from '@/lib/repositories/payments';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { auditService } from './audit-service';
import { validationService } from './validation-service';
import { withSpan, type LogContext } from '@/lib/observability';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function mapPaymentError(error: unknown): ServiceResult<Payment> {
  const message = getErrorMessage(error);

  if (message.includes('FORBIDDEN')) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };
  if (message.includes('INVOICE_NOT_FOUND')) return { success: false, error: 'Invoice not found', errorCode: 'NOT_FOUND' };
  if (message.includes('FULLY_PAID')) return { success: false, error: 'cannotPayFullyPaid', errorCode: 'FULLY_PAID' };
  if (message.includes('EXCEEDS_BALANCE')) return { success: false, error: 'exceedsBalance', errorCode: 'EXCEEDS_BALANCE' };
  if (message.includes('INVALID_AMOUNT')) return { success: false, error: 'Invalid payment amount', errorCode: 'VALIDATION' };

  throw error;
}

export const paymentService = {
  async list(auth: AuthContext, ctx: LogContext, filters?: { invoiceId?: string }) {
    return paymentsRepository.findAll(ctx, filters);
  },

  async recordPayment(
    auth: AuthContext,
    input: {
      invoice_id: string;
      amount: number;
      payment_date: string;
      payment_method: PaymentMethod;
      reference_number?: string;
      notes?: string;
    },
    ctx: LogContext
  ): Promise<ServiceResult<Payment>> {
    if (!auth.isAdminEditor) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };

    return withSpan('paymentService.recordPayment', { ...ctx, service: 'payment', user_id: auth.userId }, async () => {
      const validation = validationService.validatePayment(input);
      if (!validation.valid) return { success: false, error: validation.errors.join(', '), errorCode: 'VALIDATION' };

      const oldInvoice = await invoicesRepository.findById(input.invoice_id, ctx);
      if (!oldInvoice) return { success: false, error: 'Invoice not found', errorCode: 'NOT_FOUND' };

      if (oldInvoice.status === 'fully_paid') {
        return { success: false, error: 'cannotPayFullyPaid', errorCode: 'FULLY_PAID' };
      }

      const remaining = Number(oldInvoice.amount) - Number(oldInvoice.paid_amount);
      if (input.amount > remaining) {
        return { success: false, error: 'exceedsBalance', errorCode: 'EXCEEDS_BALANCE' };
      }

      let payment: Payment;
      try {
        payment = await paymentsRepository.recordAtomic({
          invoice_id: input.invoice_id,
          amount: input.amount,
          payment_date: input.payment_date,
          payment_method: input.payment_method,
          reference_number: input.reference_number ?? null,
          notes: input.notes ?? null,
          created_by: auth.userId,
        }, ctx);
      } catch (error) {
        return mapPaymentError(error);
      }

      await auditService.log(auth, 'create', 'payment', payment.id, null, payment, ctx);
      const updatedInvoice = await invoicesRepository.findById(input.invoice_id, ctx);
      await auditService.log(
        auth,
        'update',
        'invoice',
        input.invoice_id,
        { paid_amount: oldInvoice.paid_amount, status: oldInvoice.status },
        { paid_amount: updatedInvoice?.paid_amount, status: updatedInvoice?.status },
        ctx
      );

      return { success: true, data: payment };
    });
  },
};
