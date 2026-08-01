import type { AuthContext, ServiceResult } from '@/types/database';
import { hasPermission } from '@/lib/auth/permissions';
import { contractsRepository } from '@/lib/repositories/contracts';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { withSpan, type LogContext } from '@/lib/observability';
import { isUniqueViolation } from '@/lib/db/postgres-errors';
import {
  calculateAllUnitRentPeriods,
  calculateContractBillingSchedule,
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
        const lines = contract.lines ?? [];
        const schedule = lines.length > 0
          ? calculateContractBillingSchedule({
              start_date: contract.start_date,
              end_date: contract.end_date,
              payment_cycle: contract.payment_cycle,
              lines: lines.map((line) => ({
                contractLineId: line.id,
                lineType: line.line_type,
                unitId: line.unit_id,
                description: line.description,
                odooProductId: line.odoo_product_id,
                odooProductName: line.odoo_product_name,
                amount: Number(line.amount),
                taxRate: Number(line.tax_rate),
                taxTreatment: line.tax_treatment === 'zero_rated' ? 'zero_rated' : 'standard',
                sortOrder: line.sort_order,
              })),
            })
          : calculateContractPaymentSchedule({
              start_date: contract.start_date,
              end_date: contract.end_date,
              payment_cycle: contract.payment_cycle,
              total_amount: Number(contract.total_amount),
            }).map((period) => ({
              ...period,
              amountUntaxed: period.amount,
              amountTax: 0,
              amountTotal: period.amount,
              lineItems: [] as ReturnType<typeof calculateContractBillingSchedule>[number]['lineItems'],
            }));

        for (const period of schedule) {
          const existing = await invoicesRepository.findByUnitAndPeriod(
            contract.unit_id,
            period.periodStart,
            period.periodEnd,
            ctx,
            contract.id,
          );
          if (existing) continue;

          try {
            const invoice = await invoicesRepository.create({
              contract_id: contract.id,
              unit_id: contract.unit_id,
              tenant_id: contract.tenant_id,
              period_start: period.periodStart,
              period_end: period.periodEnd,
              amount_untaxed: period.amountUntaxed,
              amount_tax: period.amountTax,
              amount_total: period.amountTotal,
              amount: period.amountTotal,
              paid_amount: 0,
              status: 'due',
              due_date: period.periodStart,
              issued_at: null,
              notes: null,
            }, ctx);
            if (period.lineItems.length > 0) {
              await invoicesRepository.createLines(
                invoice.id,
                period.lineItems.map((line) => ({
                  contract_line_id: line.contractLineId,
                  line_type: line.lineType,
                  unit_id: line.unitId,
                  description: line.description,
                  odoo_product_id: line.odooProductId,
                  odoo_product_name: line.odooProductName,
                  amount_untaxed: line.amountUntaxed,
                  tax_rate: line.taxRate,
                  tax_treatment: line.taxTreatment,
                  amount_tax: line.amountTax,
                  amount_total: line.amountTotal,
                  period_start: period.periodStart,
                  period_end: period.periodEnd,
                  sort_order: line.sortOrder,
                })),
                ctx,
              );
            }
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

  async getDueThisMonth(auth: AuthContext, ctx: LogContext, filters?: { locationId?: string }) {
    const setting = await settingsRepository.findByKey('due_reminder_days', ctx);
    const days = Math.min(90, Math.max(0, Number(setting?.value ?? 7)));
    return invoicesRepository.findDueThisMonth(ctx, days, filters);
  },

  async countDueThisMonth(auth: AuthContext, ctx: LogContext, filters?: { locationId?: string }) {
    if (!hasPermission(auth, 'invoices.view')) return 0;
    const setting = await settingsRepository.findByKey('due_reminder_days', ctx);
    const days = Math.min(90, Math.max(0, Number(setting?.value ?? 7)));
    return invoicesRepository.countDueThisMonth(ctx, days, filters);
  },

  calculatePeriodAmount,
  getCycleMonths,
  calculateRentPeriod,
  calculateAllUnitRentPeriods,
  calculateUnitDueDate,
  calculateUnitRentPeriod,
};
