export type LocalInvoiceMatchCandidate = {
  invoiceId: string;
  invoiceNumber: string;
  odooInvoiceId: number | null;
  contractId: string;
  contractNumber: string;
  contractStatus: 'draft' | 'active' | 'cancelled' | 'completed';
  contractStart: string | null;
  contractEnd: string | null;
  /** First period_start eligible for Odoo tracking; null keeps legacy behavior. */
  odooTrackingStartDate: string | null;
  tenantOdooPartnerId: number | null;
  tenantName: string | null;
  unitId: string;
  unitNumber: string;
  periodStart: string;
  periodEnd: string;
  amountTotal: number;
  status: string;
};

/** Historical periods before cutover are represented by opening balance, not Odoo links. */
export function isCandidateBeforeOdooTracking(candidate: LocalInvoiceMatchCandidate) {
  return Boolean(
    candidate.odooTrackingStartDate
    && candidate.periodStart < candidate.odooTrackingStartDate,
  );
}

export function filterCandidatesForOdooTracking(candidates: LocalInvoiceMatchCandidate[]) {
  return candidates.filter((candidate) => !isCandidateBeforeOdooTracking(candidate));
}

/**
 * True when the Odoo line period falls before every active cutover for that unit+tenant.
 * Used to exclude historical Odoo documents from operational import/save.
 */
export function isOdooInputBeforeContractTracking(
  input: Pick<OdooLocalInvoiceMatchInput, 'partnerOdooId' | 'unitId' | 'periodStart' | 'invoiceDate'>,
  candidates: LocalInvoiceMatchCandidate[],
): boolean {
  const periodStart = input.periodStart ?? input.invoiceDate ?? null;
  if (!input.unitId || !periodStart) return false;

  const cutovers = candidates
    .filter((candidate) => (
      candidate.contractStatus === 'active'
      && candidate.unitId === input.unitId
      && matchesTenant(candidate, input.partnerOdooId)
      && candidate.odooTrackingStartDate
    ))
    .map((candidate) => candidate.odooTrackingStartDate as string);

  if (cutovers.length === 0) return false;
  return cutovers.every((cutover) => periodStart < cutover);
}

export type OdooLocalInvoiceMatchInput = {
  odooInvoiceId: number;
  partnerOdooId: number | null;
  reference: string | null;
  unitId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  invoiceDate?: string | null;
  amountTotal: number;
};

export type OdooLocalInvoiceMatch = {
  candidate: LocalInvoiceMatchCandidate | null;
  reason:
    | 'odooInvoiceId'
    | 'contractReference'
    | 'unitTenantPeriod'
    | 'contractNotMatched'
    | 'localInvoiceMissing'
    | 'multipleLocalInvoices'
    | 'amountMismatch';
};

const AMOUNT_TOLERANCE = 0.02;

function normalizedContractNumber(value: string | null) {
  return value?.trim().replace(/\s+/g, ' ').toLocaleUpperCase() ?? null;
}

function sameAmount(left: number, right: number) {
  return Math.abs(left - right) <= AMOUNT_TOLERANCE;
}

function matchesTenant(candidate: LocalInvoiceMatchCandidate, partnerOdooId: number | null) {
  return partnerOdooId != null
    && candidate.tenantOdooPartnerId != null
    && candidate.tenantOdooPartnerId === partnerOdooId;
}

export function matchOdooLineToLocalInvoice(
  input: OdooLocalInvoiceMatchInput,
  candidates: LocalInvoiceMatchCandidate[],
): OdooLocalInvoiceMatch {
  const trackable = filterCandidatesForOdooTracking(candidates);
  const linked = trackable.filter((candidate) => candidate.odooInvoiceId === input.odooInvoiceId);
  if (linked.length === 1) {
    return { candidate: linked[0], reason: 'odooInvoiceId' };
  }
  if (!input.unitId || (!input.periodStart && !input.invoiceDate)) {
    return { candidate: null, reason: 'contractNotMatched' };
  }

  const activeForUnitAndTenant = trackable.filter((candidate) => (
    candidate.contractStatus === 'active'
    && candidate.unitId === input.unitId
    && matchesTenant(candidate, input.partnerOdooId)
  ));
  if (activeForUnitAndTenant.length === 0) {
    return { candidate: null, reason: 'contractNotMatched' };
  }

  const exactPeriod = input.periodStart && input.periodEnd
    ? activeForUnitAndTenant.filter((candidate) => (
        candidate.periodStart === input.periodStart
        && candidate.periodEnd === input.periodEnd
      ))
    : activeForUnitAndTenant.filter((candidate) => (
        candidate.periodStart === input.invoiceDate
      ));
  if (exactPeriod.length === 0) {
    return { candidate: null, reason: 'localInvoiceMissing' };
  }

  const reference = normalizedContractNumber(input.reference);
  const referenceMatches = reference
    ? exactPeriod.filter((candidate) => normalizedContractNumber(candidate.contractNumber) === reference)
    : [];
  const preferred = referenceMatches.length > 0 ? referenceMatches : exactPeriod;
  if (preferred.length > 1) {
    return { candidate: null, reason: 'multipleLocalInvoices' };
  }

  const candidate = preferred[0];
  if (!candidate) {
    return { candidate: null, reason: 'localInvoiceMissing' };
  }
  if (!sameAmount(candidate.amountTotal, input.amountTotal)) {
    return { candidate: null, reason: 'amountMismatch' };
  }

  return {
    candidate,
    reason: referenceMatches.length === 1 ? 'contractReference' : 'unitTenantPeriod',
  };
}

export function localContractOptionsForLine(
  input: Pick<OdooLocalInvoiceMatchInput, 'partnerOdooId' | 'unitId' | 'periodStart' | 'periodEnd'>,
  candidates: LocalInvoiceMatchCandidate[],
) {
  if (!input.unitId) return [];

  const contracts = new Map<string, {
    id: string;
    contractNumber: string;
    tenantName: string | null;
    unitId: string;
    unitNumber: string;
    startDate: string | null;
    endDate: string | null;
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      periodStart: string;
      periodEnd: string;
      amountTotal: number;
      status: string;
    }>;
  }>();

  for (const candidate of filterCandidatesForOdooTracking(candidates)) {
    if (
      candidate.contractStatus !== 'active'
      || candidate.unitId !== input.unitId
      || !matchesTenant(candidate, input.partnerOdooId)
    ) {
      continue;
    }
    if (
      input.periodStart
      && input.periodEnd
      && candidate.contractStart
      && candidate.contractEnd
      && (input.periodStart < candidate.contractStart || input.periodEnd > candidate.contractEnd)
    ) {
      continue;
    }

    const option = contracts.get(candidate.contractId) ?? {
      id: candidate.contractId,
      contractNumber: candidate.contractNumber,
      tenantName: candidate.tenantName,
      unitId: candidate.unitId,
      unitNumber: candidate.unitNumber,
      startDate: candidate.contractStart,
      endDate: candidate.contractEnd,
      invoices: [],
    };
    option.invoices.push({
      id: candidate.invoiceId,
      invoiceNumber: candidate.invoiceNumber,
      periodStart: candidate.periodStart,
      periodEnd: candidate.periodEnd,
      amountTotal: candidate.amountTotal,
      status: candidate.status,
    });
    contracts.set(candidate.contractId, option);
  }

  return [...contracts.values()].sort((left, right) => (
    left.contractNumber.localeCompare(right.contractNumber)
  ));
}
