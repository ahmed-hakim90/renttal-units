import type { AuthContext, ServiceResult } from '@/types/database';
import { contractsRepository } from '@/lib/repositories/contracts';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { withSpan, type LogContext } from '@/lib/observability';
import {
  calculateAllUnitRentPeriods,
  calculateContractPaymentSchedule,
  calculatePeriodAmount,
  calculateRentPeriod,
  calculateUnitDueDate,
  calculateUnitRentPeriod,
  getCycleMonths,
} from '@/lib/rental/calculations';

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
  );
}

export const rentalService = {
  async generateDueInvoices(auth: AuthContext, ctx: LogContext): Promise<ServiceResult<{ created: number }>> {
    if (!auth.isAdminEditor) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };

    return withSpan('rentalService.generateDueInvoices', { ...ctx, service: 'rental', user_id: auth.userId }, async () => {
      const contracts = await contractsRepository.findActive(ctx);
      let created = 0;

      for (const contract of contracts) {
        const periods = calculateContractPaymentSchedule(contract);

        for (const { periodStart, periodEnd, amount } of periods) {
          const existing = await invoicesRepository.findByUnitAndPeriod(contract.unit_id, periodStart, periodEnd, ctx, contract.id);
          if (existing) continue;

          const invoiceNumber = `DUE-${contract.id.slice(0, 8)}-${periodStart}`;

          const existingNumber = await invoicesRepository.findByInvoiceNumber(invoiceNumber, ctx);
          if (existingNumber) continue;

          try {
            await invoicesRepository.create({
              invoice_number: invoiceNumber,
              contract_id: contract.id,
              unit_id: contract.unit_id,
              tenant_id: null,
              period_start: periodStart,
              period_end: periodEnd,
              amount,
              paid_amount: 0,
              status: 'due',
              due_date: periodStart,
              issued_at: null,
              notes: null,
            }, ctx);
          } catch (error) {
            if (!isUniqueViolation(error)) throw error;

            const duplicate = await invoicesRepository.findByInvoiceNumber(invoiceNumber, ctx);
            if (duplicate) continue;

            const concurrentInvoice = await invoicesRepository.findByUnitAndPeriod(
              contract.unit_id,
              periodStart,
              periodEnd,
              ctx,
              contract.id
            );
            if (concurrentInvoice) continue;
            throw error;
          }
          created++;
        }
      }

      return { success: true, data: { created } };
    });
  },

  async getDueThisMonth(auth: AuthContext, ctx: LogContext) {
    return invoicesRepository.findDueThisMonth(ctx);
  },

  calculatePeriodAmount,
  getCycleMonths,
  calculateRentPeriod,
  calculateAllUnitRentPeriods,
  calculateUnitDueDate,
  calculateUnitRentPeriod,
};
