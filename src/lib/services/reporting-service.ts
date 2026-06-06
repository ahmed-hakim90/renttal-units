import type { AuthContext, Invoice } from '@/types/database';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { withSpan, type LogContext } from '@/lib/observability';

export const reportingService = {
  async getDebtAgingInvoices(
    auth: AuthContext,
    ctx: LogContext,
    filters?: { locationId?: string }
  ): Promise<Invoice[]> {
    return withSpan('reportingService.getDebtAgingInvoices', { ...ctx, service: 'reporting', user_id: auth.userId }, async () => {
      let invoices = await invoicesRepository.findOutstanding(ctx);

      if (filters?.locationId) {
        invoices = invoices.filter((inv) => inv.unit?.location_id === filters.locationId);
      }

      return invoices;
    });
  },

  async getPortfolioSummary(auth: AuthContext, ctx: LogContext) {
    const { unitsRepository } = await import('@/lib/repositories/units');
    const { locationsRepository } = await import('@/lib/repositories/locations');

    const [units, locations] = await Promise.all([
      unitsRepository.findAll(ctx),
      locationsRepository.findAll(ctx),
    ]);

    const occupied = units.filter((u) => u.status === 'occupied').length;
    const monthlyRevenue = units.reduce((sum, u) => sum + Number(u.monthly_rent), 0);

    return {
      totalUnits: units.length,
      totalLocations: locations.length,
      occupancyRate: units.length > 0 ? Math.round((occupied / units.length) * 100) : 0,
      monthlyRevenue,
    };
  },
};
