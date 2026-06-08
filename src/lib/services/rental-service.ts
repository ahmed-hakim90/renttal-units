import type { AuthContext, ServiceResult } from '@/types/database';
import { contractsRepository } from '@/lib/repositories/contracts';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { withSpan, type LogContext } from '@/lib/observability';
import { isUniqueViolation } from '@/lib/db/postgres-errors';
import {
  calculateAllUnitRentPeriods,
  calculateContractPaymentSchedule,
  calculatePeriodAmount,
  calculateRentPeriod,
  calculateUnitDueDate,
  calculateUnitRentPeriod,
  getCycleMonths,
} from '@/lib/rental/calculations';
import { buildDueInvoiceNumber } from '@/lib/rental/due-invoice-number';

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

          try {
            await invoicesRepository.create({
              invoice_number: buildDueInvoiceNumber(contract.id, periodStart),
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
            if (isUniqueViolation(error)) continue;
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
