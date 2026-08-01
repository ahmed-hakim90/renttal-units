import type {
  AuthContext,
  Contract,
  DashboardDebtAgingSummary,
  DashboardOdooHealth,
  DashboardPortfolioSummary,
  Invoice,
  LocationOccupancySummary,
  LocationStatement,
} from '@/types/database';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { buildDashboardDebtAgingSummary } from '@/lib/rental/aging';
import { hasPermission } from '@/lib/auth/permissions';
import { withSpan, type LogContext } from '@/lib/observability';

function sumInvoiceRemaining(invoice: Invoice) {
  return Math.max(0, Number(invoice.amount) - Number(invoice.paid_amount));
}

function contractTouchesUnitIds(contract: Contract, unitIds: Set<string>) {
  if (contract.unit_id && unitIds.has(contract.unit_id)) return true;
  return (contract.lines ?? []).some((line) => (
    line.line_type === 'rental' && line.unit_id && unitIds.has(line.unit_id)
  ));
}

export const reportingService = {
  async getDebtAgingInvoices(
    auth: AuthContext,
    ctx: LogContext,
    filters?: { locationId?: string }
  ): Promise<Invoice[]> {
    return withSpan('reportingService.getDebtAgingInvoices', { ...ctx, service: 'reporting', user_id: auth.userId }, async () => {
      return invoicesRepository.findOutstanding(ctx, filters);
    });
  },

  async getDashboardDebtAgingSummary(
    auth: AuthContext,
    ctx: LogContext,
    filters?: { locationId?: string },
  ): Promise<DashboardDebtAgingSummary> {
    return withSpan('reportingService.getDashboardDebtAgingSummary', { ...ctx, service: 'reporting', user_id: auth.userId }, async () => {
      const invoices = await invoicesRepository.findOutstanding(ctx, filters);
      return buildDashboardDebtAgingSummary(invoices);
    });
  },

  async getDashboardOdooHealth(
    auth: AuthContext,
    ctx: LogContext,
  ): Promise<DashboardOdooHealth> {
    return withSpan('reportingService.getDashboardOdooHealth', { ...ctx, service: 'reporting', user_id: auth.userId }, async () => {
      const [failedCount, needsReviewCount] = await Promise.all([
        invoicesRepository.countByOdooSyncStatus(['failed'], ctx),
        invoicesRepository.countByOdooSyncStatus(['needs_review'], ctx),
      ]);
      return { failedCount, needsReviewCount };
    });
  },

  async getDashboardOverview(
    auth: AuthContext,
    ctx: LogContext,
    filters?: { locationId?: string },
  ): Promise<{
    summary: DashboardPortfolioSummary;
    locationsOccupancy: LocationOccupancySummary[];
  }> {
    const { unitsRepository } = await import('@/lib/repositories/units');
    const { locationsRepository } = await import('@/lib/repositories/locations');
    const { contractsRepository } = await import('@/lib/repositories/contracts');
    const { calculateContractPaymentSchedule } = await import('@/lib/rental/calculations');
    const { countContractsExpiringSoon } = await import('@/lib/rental/contract-expiry');

    return withSpan('reportingService.getDashboardOverview', { ...ctx, service: 'reporting', user_id: auth.userId }, async () => {
      const [allUnits, allLocations, allActiveContracts, contractStats] = await Promise.all([
        unitsRepository.findAll(ctx, filters?.locationId ? { locationId: filters.locationId } : undefined),
        locationsRepository.findAll(ctx),
        contractsRepository.findActive(ctx),
        contractsRepository.getSummaryStats(ctx),
      ]);

      const locations = filters?.locationId
        ? allLocations.filter((location) => location.id === filters.locationId)
        : allLocations;
      const units = allUnits;
      const unitIds = new Set(units.map((unit) => unit.id));
      const activeContracts = filters?.locationId
        ? allActiveContracts.filter((contract) => contractTouchesUnitIds(contract, unitIds))
        : allActiveContracts;

      const occupied = units.filter((unit) => unit.status === 'occupied').length;
      const vacantUnits = units.filter((unit) => unit.status === 'vacant').length;
      const maintenanceUnits = units.filter((unit) => unit.status === 'maintenance').length;
      const monthlyRevenue = activeContracts.reduce((sum, contract) => {
        const schedule = calculateContractPaymentSchedule(contract);
        if (schedule.length === 0) return sum;
        return sum + Number(contract.total_amount) / schedule.length;
      }, 0);

      const occupancyByLocation = new Map<string, LocationOccupancySummary>();
      for (const location of locations) {
        occupancyByLocation.set(location.id, {
          locationId: location.id,
          name_en: location.name_en,
          name_ar: location.name_ar,
          totalUnits: 0,
          vacantUnits: 0,
          occupiedUnits: 0,
          maintenanceUnits: 0,
          activeContractCount: 0,
        });
      }

      for (const unit of units) {
        const summary = occupancyByLocation.get(unit.location_id);
        if (!summary) continue;

        summary.totalUnits += 1;
        if (unit.status === 'vacant') summary.vacantUnits += 1;
        if (unit.status === 'occupied') summary.occupiedUnits += 1;
        if (unit.status === 'maintenance') summary.maintenanceUnits += 1;
        if (unit.active_contract) summary.activeContractCount += 1;
      }

      let summaryStats = contractStats;
      if (filters?.locationId) {
        const allContracts = await contractsRepository.findAll(ctx);
        const locationContracts = allContracts.filter((contract) => contractTouchesUnitIds(contract, unitIds));
        summaryStats = {
          totalCount: locationContracts.length,
          totalValue: locationContracts.reduce((sum, contract) => sum + Number(contract.total_amount), 0),
          activeCount: locationContracts.filter((contract) => contract.status === 'active').length,
          draftCount: locationContracts.filter((contract) => contract.status === 'draft').length,
        };
      }

      return {
        summary: {
          totalUnits: units.length,
          totalLocations: locations.length,
          occupancyRate: units.length > 0 ? Math.round((occupied / units.length) * 100) : 0,
          monthlyRevenue: Math.round(monthlyRevenue),
          totalContracts: summaryStats.totalCount,
          totalContractsValue: summaryStats.totalValue,
          activeContracts: summaryStats.activeCount,
          expiringContracts: hasPermission(auth, 'contracts.view')
            ? countContractsExpiringSoon(activeContracts)
            : 0,
          vacantUnits,
          maintenanceUnits,
          draftContracts: summaryStats.draftCount,
        },
        locationsOccupancy: Array.from(occupancyByLocation.values()),
      };
    });
  },

  async getLocationStatement(
    auth: AuthContext,
    ctx: LogContext,
    locationId: string
  ): Promise<LocationStatement> {
    const { unitsRepository } = await import('@/lib/repositories/units');
    const { locationsRepository } = await import('@/lib/repositories/locations');
    const { contractsRepository } = await import('@/lib/repositories/contracts');
    const { odooImportRepository } = await import('@/lib/repositories/odoo-import');

    return withSpan('reportingService.getLocationStatement', { ...ctx, service: 'reporting', user_id: auth.userId }, async () => {
      const [locations, units, contracts, invoices, odooDocuments] = await Promise.all([
        locationsRepository.findAll(ctx),
        unitsRepository.findAll(ctx, { locationId }),
        contractsRepository.findAll(ctx),
        invoicesRepository.findAll(ctx, { locationId }),
        odooImportRepository.findDocuments({ locationId }, ctx),
      ]);

      const location = locations.find((item) => item.id === locationId) ?? null;
      const unitIds = new Set(units.map((unit) => unit.id));
      const locationContracts = contracts.filter((contract) => {
        if (contract.unit_id && unitIds.has(contract.unit_id)) return true;
        return (contract.lines ?? []).some((line) => (
          line.line_type === 'rental' && line.unit_id && unitIds.has(line.unit_id)
        ));
      });

      const contractsByUnit = new Map<string, Contract[]>();
      for (const contract of locationContracts) {
        const rentalUnitIds = (contract.lines ?? [])
          .filter((line) => line.line_type === 'rental' && line.unit_id)
          .map((line) => line.unit_id as string);
        const ids = rentalUnitIds.length > 0
          ? rentalUnitIds
          : (contract.unit_id ? [contract.unit_id] : []);
        for (const unitId of ids) {
          if (!unitIds.has(unitId)) continue;
          const unitContracts = contractsByUnit.get(unitId) ?? [];
          unitContracts.push(contract);
          contractsByUnit.set(unitId, unitContracts);
        }
      }

      const invoicesByUnit = new Map<string, Invoice[]>();
      for (const invoice of invoices) {
        const unitInvoices = invoicesByUnit.get(invoice.unit_id) ?? [];
        unitInvoices.push(invoice);
        invoicesByUnit.set(invoice.unit_id, unitInvoices);
      }
      const normalizedOdooIds = new Set(odooDocuments.map((document) => document.odoo_invoice_id));
      const odooLinesByUnit = new Map<string, Array<{
        amountTotal: number;
        documentId: string;
        invoiceName: string;
        documentPaid: number;
        documentResidual: number;
        documentUnitCount: number;
      }>>();
      for (const document of odooDocuments) {
        const documentUnitIds = new Set((document.lines ?? []).map((line) => line.unit_id).filter(Boolean));
        for (const line of document.lines ?? []) {
          if (!line.unit_id) continue;
          const rows = odooLinesByUnit.get(line.unit_id) ?? [];
          rows.push({
            amountTotal: Number(line.amount_total),
            documentId: document.id,
            invoiceName: document.invoice_name,
            documentPaid: Number(document.amount_paid),
            documentResidual: Number(document.amount_residual),
            documentUnitCount: documentUnitIds.size,
          });
          odooLinesByUnit.set(line.unit_id, rows);
        }
      }

      const statementUnits = units.map((unit) => {
        const unitContracts = contractsByUnit.get(unit.id) ?? [];
        const activeContract = unit.active_contract ?? unitContracts.find((contract) => contract.status === 'active') ?? null;
        const unitInvoices = invoicesByUnit.get(unit.id) ?? [];
        const localOnlyInvoices = unitInvoices.filter((invoice) => (
          !invoice.odoo_invoice_id || !normalizedOdooIds.has(invoice.odoo_invoice_id)
        ));
        const odooLines = odooLinesByUnit.get(unit.id) ?? [];
        const odooDocumentsForUnit = new Map(odooLines.map((line) => [line.documentId, line]));
        const invoiceTotal = localOnlyInvoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0)
          + odooLines.reduce((sum, line) => sum + line.amountTotal, 0);
        const paidTotal = localOnlyInvoices.reduce((sum, invoice) => sum + Number(invoice.paid_amount), 0)
          + [...odooDocumentsForUnit.values()]
            .filter((document) => document.documentUnitCount === 1)
            .reduce((sum, document) => sum + document.documentPaid, 0);
        const remainingTotal = localOnlyInvoices.reduce((sum, invoice) => sum + sumInvoiceRemaining(invoice), 0)
          + [...odooDocumentsForUnit.values()].reduce((sum, document) => (
            sum + (document.documentUnitCount === 1
              ? document.documentResidual
              : odooLines.filter((line) => line.documentId === document.documentId)
                .reduce((lineSum, line) => lineSum + line.amountTotal, 0))
          ), 0);
        const odooInvoiceNames = Array.from(new Set([
          ...unitInvoices
            .map((invoice) => invoice.odoo_invoice_name)
            .filter((name): name is string => Boolean(name)),
          ...odooLines.map((line) => line.invoiceName),
        ]));

        return {
          unitId: unit.id,
          unitNumber: unit.unit_number,
          status: unit.status,
          tenantName: activeContract?.tenant?.full_name ?? unit.tenant?.full_name ?? null,
          activeContractNumber: activeContract?.contract_number ?? null,
          activeContractStartDate: activeContract?.start_date ?? null,
          activeContractEndDate: activeContract?.end_date ?? null,
          activeContractValue: activeContract
            ? Number(
              (activeContract.lines ?? [])
                .filter((line) => line.line_type === 'rental' && line.unit_id === unit.id)
                .reduce((sum, line) => sum + Number(line.amount), 0)
              || activeContract.total_amount,
            )
            : 0,
          contractCount: unitContracts.length,
          invoiceCount: localOnlyInvoices.length + odooDocumentsForUnit.size,
          invoiceTotal,
          paidTotal,
          remainingTotal,
          odooInvoiceCount: odooInvoiceNames.length,
          odooFailedCount: unitInvoices.filter((invoice) => invoice.odoo_sync_status === 'failed').length,
          odooInvoiceNames,
        };
      });

      const localOnlyInvoices = invoices.filter((invoice) => (
        !invoice.odoo_invoice_id || !normalizedOdooIds.has(invoice.odoo_invoice_id)
      ));
      const totals = {
        unitCount: statementUnits.length,
        occupiedUnits: statementUnits.filter((unit) => unit.status === 'occupied').length,
        vacantUnits: statementUnits.filter((unit) => unit.status === 'vacant').length,
        maintenanceUnits: statementUnits.filter((unit) => unit.status === 'maintenance').length,
        activeContractCount: locationContracts.filter((contract) => contract.status === 'active').length,
        contractCount: locationContracts.length,
        contractValueTotal: locationContracts.reduce((sum, contract) => sum + Number(contract.total_amount), 0),
        invoiceTotal: localOnlyInvoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0)
          + odooDocuments.reduce((sum, document) => sum + Number(document.amount_total), 0),
        paidTotal: localOnlyInvoices.reduce((sum, invoice) => sum + Number(invoice.paid_amount), 0)
          + odooDocuments.reduce((sum, document) => sum + Number(document.amount_paid), 0),
        remainingTotal: localOnlyInvoices.reduce((sum, invoice) => sum + sumInvoiceRemaining(invoice), 0)
          + odooDocuments.reduce((sum, document) => sum + Number(document.amount_residual), 0),
        odooInvoiceCount: odooDocuments.length
          + localOnlyInvoices.filter((invoice) => invoice.odoo_invoice_id).length,
        odooFailedCount: invoices.filter((invoice) => invoice.odoo_sync_status === 'failed').length,
      };

      return { location, units: statementUnits, totals };
    });
  },
};
