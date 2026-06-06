import type { AuthContext, ServiceResult } from '@/types/database';
import { unitsRepository } from '@/lib/repositories/units';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { withSpan, type LogContext } from '@/lib/observability';
import {
  calculatePeriodAmount,
  calculateRentPeriod,
  calculateUnitDueDate,
  calculateUnitRentPeriod,
  getCycleMonths,
} from '@/lib/rental/calculations';

export const rentalService = {
  async generateDueInvoices(auth: AuthContext, ctx: LogContext): Promise<ServiceResult<{ created: number }>> {
    if (!auth.isAdminEditor) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };

    return withSpan('rentalService.generateDueInvoices', { ...ctx, service: 'rental', user_id: auth.userId }, async () => {
      const units = await unitsRepository.findAll(ctx, { status: 'occupied' });
      let created = 0;

      for (const unit of units) {
        const period = calculateUnitRentPeriod(unit);
        if (!period) continue;

        const { periodStart, periodEnd } = period;
        const existing = await invoicesRepository.findByUnitAndPeriod(unit.id, periodStart, periodEnd, ctx);
        if (existing) continue;

        const amount = calculatePeriodAmount(Number(unit.monthly_rent), unit.payment_cycle);
        const dueDate = calculateUnitDueDate(unit) ?? periodStart;
        const invoiceNumber = `DUE-${unit.unit_number}-${unit.id.slice(0, 8)}-${periodStart}`;

        await invoicesRepository.create({
          invoice_number: invoiceNumber,
          unit_id: unit.id,
          tenant_id: unit.tenant_id,
          period_start: periodStart,
          period_end: periodEnd,
          amount,
          paid_amount: 0,
          status: 'due',
          due_date: dueDate,
          issued_at: null,
          notes: null,
        }, ctx);
        created++;
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
  calculateUnitDueDate,
  calculateUnitRentPeriod,
};
