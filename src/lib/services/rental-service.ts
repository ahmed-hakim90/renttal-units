import type { AuthContext, ServiceResult } from '@/types/database';
import { hasPermission } from '@/lib/auth/permissions';
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
import { settingsRepository } from '@/lib/repositories/settings';

export const rentalService = {
  async generateDueInvoices(auth: AuthContext, ctx: LogContext): Promise<ServiceResult<{ created: number }>> {
    if (!hasPermission(auth, 'invoices.create')) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };

    return withSpan('rentalService.generateDueInvoices', { ...ctx, service: 'rental', user_id: auth.userId }, async () => {
      const contracts = await contractsRepository.findActive(ctx);
      let created = 0;

      for (const contract of contracts) {
        if (!contract.unit_id || !contract.start_date || !contract.end_date) continue;
        const periods = calculateContractPaymentSchedule({
          start_date: contract.start_date,
          end_date: contract.end_date,
          payment_cycle: contract.payment_cycle,
          total_amount: Number(contract.total_amount),
        });

        for (const { periodStart, periodEnd, amount } of periods) {
          const existing = await invoicesRepository.findByUnitAndPeriod(contract.unit_id, periodStart, periodEnd, ctx, contract.id);
          if (existing) continue;

          try {
            await invoicesRepository.create({
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
    const setting = await settingsRepository.findByKey('due_reminder_days', ctx);
    const days = Math.min(90, Math.max(0, Number(setting?.value ?? 7)));
    return invoicesRepository.findDueThisMonth(ctx, days);
  },

  async countDueThisMonth(auth: AuthContext, ctx: LogContext) {
    if (!hasPermission(auth, 'invoices.view')) return 0;
    const setting = await settingsRepository.findByKey('due_reminder_days', ctx);
    const days = Math.min(90, Math.max(0, Number(setting?.value ?? 7)));
    return invoicesRepository.countDueThisMonth(ctx, days);
  },

  calculatePeriodAmount,
  getCycleMonths,
  calculateRentPeriod,
  calculateAllUnitRentPeriods,
  calculateUnitDueDate,
  calculateUnitRentPeriod,
};
