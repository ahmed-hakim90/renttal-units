import type { AuthContext, Contract, Invoice, LocationStatement } from '@/types/database';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { withSpan, type LogContext } from '@/lib/observability';

function sumInvoiceRemaining(invoice: Invoice) {
  return Math.max(0, Number(invoice.amount) - Number(invoice.paid_amount));
}

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
    const { contractsRepository } = await import('@/lib/repositories/contracts');
    const { calculateContractPaymentSchedule } = await import('@/lib/rental/calculations');

    const [units, locations, activeContracts, contractStats] = await Promise.all([
      unitsRepository.findAll(ctx),
      locationsRepository.findAll(ctx),
      contractsRepository.findActive(ctx),
      contractsRepository.getSummaryStats(ctx),
    ]);

    const occupied = units.filter((u) => u.status === 'occupied').length;
    const monthlyRevenue = activeContracts.reduce((sum, contract) => {
      const schedule = calculateContractPaymentSchedule(contract);
      if (schedule.length === 0) return sum;
      return sum + Number(contract.total_amount) / schedule.length;
    }, 0);

    return {
      totalUnits: units.length,
      totalLocations: locations.length,
      occupancyRate: units.length > 0 ? Math.round((occupied / units.length) * 100) : 0,
      monthlyRevenue: Math.round(monthlyRevenue),
      totalContracts: contractStats.totalCount,
      totalContractsValue: contractStats.totalValue,
      activeContracts: contractStats.activeCount,
    };
  },

  async getLocationStatement(
    auth: AuthContext,
    ctx: LogContext,
    locationId: string
  ): Promise<LocationStatement> {
    const { unitsRepository } = await import('@/lib/repositories/units');
    const { locationsRepository } = await import('@/lib/repositories/locations');
    const { contractsRepository } = await import('@/lib/repositories/contracts');

    return withSpan('reportingService.getLocationStatement', { ...ctx, service: 'reporting', user_id: auth.userId }, async () => {
      const [locations, units, contracts, invoices] = await Promise.all([
        locationsRepository.findAll(ctx),
        unitsRepository.findAll(ctx, { locationId }),
        contractsRepository.findAll(ctx),
        invoicesRepository.findAll(ctx, { locationId }),
      ]);

      const location = locations.find((item) => item.id === locationId) ?? null;
      const unitIds = new Set(units.map((unit) => unit.id));
      const locationContracts = contracts.filter((contract) => unitIds.has(contract.unit_id));

      const contractsByUnit = new Map<string, Contract[]>();
      for (const contract of locationContracts) {
        const unitContracts = contractsByUnit.get(contract.unit_id) ?? [];
        unitContracts.push(contract);
        contractsByUnit.set(contract.unit_id, unitContracts);
      }

      const invoicesByUnit = new Map<string, Invoice[]>();
      for (const invoice of invoices) {
        const unitInvoices = invoicesByUnit.get(invoice.unit_id) ?? [];
        unitInvoices.push(invoice);
        invoicesByUnit.set(invoice.unit_id, unitInvoices);
      }

      const statementUnits = units.map((unit) => {
        const unitContracts = contractsByUnit.get(unit.id) ?? [];
        const activeContract = unit.active_contract ?? unitContracts.find((contract) => contract.status === 'active') ?? null;
        const unitInvoices = invoicesByUnit.get(unit.id) ?? [];
        const invoiceTotal = unitInvoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
        const paidTotal = unitInvoices.reduce((sum, invoice) => sum + Number(invoice.paid_amount), 0);
        const remainingTotal = unitInvoices.reduce((sum, invoice) => sum + sumInvoiceRemaining(invoice), 0);

        return {
          unitId: unit.id,
          unitNumber: unit.unit_number,
          status: unit.status,
          tenantName: activeContract?.tenant?.full_name ?? unit.tenant?.full_name ?? null,
          activeContractNumber: activeContract?.contract_number ?? null,
          activeContractStartDate: activeContract?.start_date ?? null,
          activeContractEndDate: activeContract?.end_date ?? null,
          activeContractValue: activeContract ? Number(activeContract.total_amount) : 0,
          contractCount: unitContracts.length,
          invoiceCount: unitInvoices.length,
          invoiceTotal,
          paidTotal,
          remainingTotal,
        };
      });

      const totals = {
        unitCount: statementUnits.length,
        occupiedUnits: statementUnits.filter((unit) => unit.status === 'occupied').length,
        vacantUnits: statementUnits.filter((unit) => unit.status === 'vacant').length,
        maintenanceUnits: statementUnits.filter((unit) => unit.status === 'maintenance').length,
        activeContractCount: locationContracts.filter((contract) => contract.status === 'active').length,
        contractCount: locationContracts.length,
        contractValueTotal: locationContracts.reduce((sum, contract) => sum + Number(contract.total_amount), 0),
        invoiceTotal: invoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0),
        paidTotal: invoices.reduce((sum, invoice) => sum + Number(invoice.paid_amount), 0),
        remainingTotal: invoices.reduce((sum, invoice) => sum + sumInvoiceRemaining(invoice), 0),
      };

      return { location, units: statementUnits, totals };
    });
  },
};
