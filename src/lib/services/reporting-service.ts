import type { AuthContext, DebtAgingBucket } from '@/types/database';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { withSpan, type LogContext } from '@/lib/observability';
import { differenceInDays } from 'date-fns';

const BUCKETS = [
  { label: 'current', minDays: 0, maxDays: 0 },
  { label: 'days1to30', minDays: 1, maxDays: 30 },
  { label: 'days31to60', minDays: 31, maxDays: 60 },
  { label: 'days61to90', minDays: 61, maxDays: 90 },
  { label: 'over90', minDays: 91, maxDays: null },
];

function getDaysOverdue(dueDate: string): number {
  const today = new Date();
  const due = new Date(dueDate);
  return Math.max(0, differenceInDays(today, due));
}

export const reportingService = {
  async getDebtAgingReport(
    auth: AuthContext,
    ctx: LogContext,
    filters?: { locationId?: string }
  ): Promise<DebtAgingBucket[]> {
    return withSpan('reportingService.getDebtAgingReport', { ...ctx, service: 'reporting', user_id: auth.userId }, async () => {
      let invoices = await invoicesRepository.findOutstanding(ctx);

      if (filters?.locationId) {
        invoices = invoices.filter((inv) => inv.unit?.location_id === filters.locationId);
      }

      return BUCKETS.map((bucket) => {
        const bucketInvoices = invoices.filter((inv) => {
          const days = getDaysOverdue(inv.due_date);
          if (bucket.label === 'current') return days === 0;
          if (bucket.maxDays === null) return days >= bucket.minDays;
          return days >= bucket.minDays && days <= bucket.maxDays;
        });

        return {
          label: bucket.label,
          minDays: bucket.minDays,
          maxDays: bucket.maxDays,
          count: bucketInvoices.length,
          totalAmount: bucketInvoices.reduce((sum, inv) => sum + (Number(inv.amount) - Number(inv.paid_amount)), 0),
          invoices: bucketInvoices,
        };
      });
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
