import { differenceInDays, parseISO } from 'date-fns';
import type {
  AuthContext,
  Contract,
  ContractCancellationHandling,
  PaymentCycle,
  ServiceResult,
} from '@/types/database';
import { contractsRepository } from '@/lib/repositories/contracts';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { unitsRepository } from '@/lib/repositories/units';
import { tenantsRepository } from '@/lib/repositories/tenants';
import { auditService } from '@/lib/services/audit-service';
import { validationService } from '@/lib/services/validation-service';
import { isUniqueViolation } from '@/lib/db/postgres-errors';
import { calculateContractPaymentSchedule } from '@/lib/rental/calculations';
import { buildDueInvoiceNumber } from '@/lib/rental/due-invoice-number';
import {
  applyOpeningBalanceToSchedule,
  type ContractOpeningBalanceInput,
} from '@/lib/rental/contract-opening-balance';
import { validateContractOpeningBalance } from '@/lib/rental/validate-opening-balance';
import { withSpan, type LogContext } from '@/lib/observability';

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function prorateAmount(amount: number, periodStart: string, periodEnd: string, cancellationDate: string) {
  const start = parseISO(periodStart);
  const end = parseISO(periodEnd);
  const cancellation = parseISO(cancellationDate);
  const totalDays = differenceInDays(end, start) + 1;
  const usedDays = differenceInDays(cancellation, start) + 1;
  return roundMoney(amount * Math.max(0, Math.min(usedDays, totalDays)) / totalDays);
}

async function createContractInvoices(
  contract: Contract,
  ctx: LogContext,
  openingBalance?: ContractOpeningBalanceInput,
) {
  const schedule = applyOpeningBalanceToSchedule(
    calculateContractPaymentSchedule(contract),
    openingBalance,
  );
  let created = 0;

  for (const period of schedule) {
    const existing = await invoicesRepository.findByUnitAndPeriod(
      contract.unit_id,
      period.periodStart,
      period.periodEnd,
      ctx,
      contract.id
    );
    if (existing) continue;

    try {
      await invoicesRepository.create({
        invoice_number: buildDueInvoiceNumber(contract.id, period.periodStart),
        contract_id: contract.id,
        unit_id: contract.unit_id,
        tenant_id: null,
        period_start: period.periodStart,
        period_end: period.periodEnd,
        amount: period.amount,
        paid_amount: period.paid_amount,
        status: period.status,
        due_date: period.periodStart,
        issued_at: null,
        notes: null,
      }, ctx);
      created++;
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  return created;
}

function hasFinancialActivity(invoices: Awaited<ReturnType<typeof invoicesRepository.findByContractId>>) {
  return invoices.some(
    (invoice) => Number(invoice.paid_amount) > 0 || invoice.status !== 'due'
  );
}

function scheduleChanged(
  contract: Contract,
  input: {
    start_date: string;
    end_date: string;
    total_amount: number;
    payment_cycle: PaymentCycle;
  }
) {
  return (
    input.start_date !== contract.start_date
    || input.end_date !== contract.end_date
    || input.payment_cycle !== contract.payment_cycle
    || input.total_amount !== Number(contract.total_amount)
  );
}

async function syncContractTenant(
  contract: Contract,
  tenantName: string | null | undefined,
  tenantPhone: string | null | undefined,
  tenantEmail: string | null | undefined,
  ctx: LogContext
): Promise<string | null> {
  const name = tenantName?.trim() ?? '';

  if (!name) {
    await unitsRepository.update(contract.unit_id, { tenant_id: null }, ctx);
    return null;
  }

  if (contract.tenant_id) {
    await tenantsRepository.update(contract.tenant_id, {
      full_name: name,
      phone: tenantPhone?.trim() || null,
      email: tenantEmail?.trim() || null,
    }, ctx);
    await unitsRepository.update(contract.unit_id, { tenant_id: contract.tenant_id }, ctx);
    return contract.tenant_id;
  }

  const tenant = await tenantsRepository.create({
    full_name: name,
    phone: tenantPhone?.trim() || null,
    email: tenantEmail?.trim() || null,
  }, ctx);
  await unitsRepository.update(contract.unit_id, { tenant_id: tenant.id }, ctx);
  return tenant.id;
}

export const contractService = {
  async list(auth: AuthContext, ctx: LogContext) {
    return contractsRepository.findAll(ctx);
  },

  async create(
    auth: AuthContext,
    input: {
      unit_id: string;
      contract_number?: string | null;
      start_date: string;
      end_date: string;
      total_amount: number;
      payment_cycle: PaymentCycle;
      notes?: string | null;
      tenant_name?: string | null;
      tenant_phone?: string | null;
      tenant_email?: string | null;
      paid_through_date?: string | null;
      opening_paid_amount?: number | null;
    },
    ctx: LogContext
  ): Promise<ServiceResult<Contract>> {
    if (!auth.isAdminEditor) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };

    return withSpan('contractService.create', { ...ctx, service: 'contract', user_id: auth.userId }, async () => {
      const {
        tenant_name,
        tenant_phone,
        tenant_email,
        paid_through_date,
        opening_paid_amount,
        ...contractInput
      } = input;
      const openingBalance: ContractOpeningBalanceInput = {
        paid_through_date: paid_through_date ?? null,
        opening_paid_amount: opening_paid_amount ?? null,
      };

      const validation = validationService.validateContract(contractInput);
      if (!validation.valid) return { success: false, error: validation.errors.join(', '), errorCode: 'VALIDATION' };

      const openingErrors = validateContractOpeningBalance(contractInput, openingBalance);
      if (openingErrors.length > 0) {
        return { success: false, error: openingErrors.join(', '), errorCode: 'VALIDATION' };
      }

      const unit = await unitsRepository.findById(input.unit_id, ctx);
      if (!unit) return { success: false, error: 'unitNotFound', errorCode: 'NOT_FOUND' };

      const active = await contractsRepository.findActiveByUnitId(input.unit_id, ctx);
      if (active) return { success: false, error: 'activeContractExists', errorCode: 'ACTIVE_CONTRACT_EXISTS' };

      // Create tenant if name provided
      let tenantId: string | null = null;
      if (tenant_name?.trim()) {
        const tenant = await tenantsRepository.create({
          full_name: tenant_name.trim(),
          phone: tenant_phone?.trim() || null,
          email: tenant_email?.trim() || null,
        }, ctx);
        tenantId = tenant.id;
        await unitsRepository.update(input.unit_id, { tenant_id: tenantId }, ctx);
      }

      let contract: Contract;
      try {
        contract = await contractsRepository.create({ ...contractInput, tenant_id: tenantId }, ctx);
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Could be active contract index OR contract_number unique constraint
          const active2 = await contractsRepository.findActiveByUnitId(input.unit_id, ctx);
          if (active2) return { success: false, error: 'activeContractExists', errorCode: 'ACTIVE_CONTRACT_EXISTS' };
          return { success: false, error: 'duplicateContractNumber', errorCode: 'DUPLICATE_CONTRACT_NUMBER' };
        }
        throw error;
      }

      await createContractInvoices(contract, ctx, openingBalance);
      await auditService.log(auth, 'create', 'contract', contract.id, null, contract, ctx);

      const hydrated = await contractsRepository.findById(contract.id, ctx);
      return { success: true, data: hydrated ?? contract };
    });
  },

  async update(
    auth: AuthContext,
    id: string,
    input: {
      contract_number?: string | null;
      start_date: string;
      end_date: string;
      total_amount: number;
      payment_cycle: PaymentCycle;
      notes?: string | null;
      tenant_name?: string | null;
      tenant_phone?: string | null;
      tenant_email?: string | null;
    },
    ctx: LogContext
  ): Promise<ServiceResult<Contract>> {
    if (!auth.isAdminEditor) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };

    return withSpan('contractService.update', { ...ctx, service: 'contract', user_id: auth.userId }, async () => {
      const { tenant_name, tenant_phone, tenant_email, ...contractInput } = input;

      const contract = await contractsRepository.findById(id, ctx);
      if (!contract) return { success: false, error: 'contractNotFound', errorCode: 'NOT_FOUND' };
      if (contract.status !== 'active') return { success: false, error: 'contractNotActive', errorCode: 'VALIDATION' };

      const validation = validationService.validateContract({ ...contractInput, unit_id: contract.unit_id });
      if (!validation.valid) return { success: false, error: validation.errors.join(', '), errorCode: 'VALIDATION' };

      const invoices = await invoicesRepository.findByContractId(id, ctx);
      const scheduleFieldsChanged = scheduleChanged(contract, contractInput);

      if (scheduleFieldsChanged && hasFinancialActivity(invoices)) {
        return { success: false, error: 'contractHasFinancialActivity', errorCode: 'VALIDATION' };
      }

      const tenantId = await syncContractTenant(contract, tenant_name, tenant_phone, tenant_email, ctx);

      let updated: Contract;
      try {
        updated = await contractsRepository.update(id, {
          ...contractInput,
          tenant_id: tenantId,
        }, ctx);
      } catch (error) {
        if (isUniqueViolation(error)) {
          return { success: false, error: 'duplicateContractNumber', errorCode: 'DUPLICATE_CONTRACT_NUMBER' };
        }
        throw error;
      }

      if (scheduleFieldsChanged) {
        await invoicesRepository.deleteAllDueByContractId(id, ctx);
        await invoicesRepository.deleteDueOutsideContractBounds(
          id,
          updated.start_date,
          updated.end_date,
          ctx,
        );
        await createContractInvoices(updated, ctx);
      }

      await auditService.log(auth, 'update', 'contract', id, contract, updated, ctx);

      const hydrated = await contractsRepository.findById(id, ctx);
      return { success: true, data: hydrated ?? updated };
    });
  },

  async cancel(
    auth: AuthContext,
    id: string,
    input: {
      cancellation_date: string;
      cancellation_handling: ContractCancellationHandling;
    },
    ctx: LogContext
  ): Promise<ServiceResult<Contract>> {
    if (!auth.isAdminEditor) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };

    return withSpan('contractService.cancel', { ...ctx, service: 'contract', user_id: auth.userId }, async () => {
      const validation = validationService.validateCancelContract(input);
      if (!validation.valid) return { success: false, error: validation.errors.join(', '), errorCode: 'VALIDATION' };

      const contract = await contractsRepository.findById(id, ctx);
      if (!contract) return { success: false, error: 'contractNotFound', errorCode: 'NOT_FOUND' };
      if (contract.status !== 'active') return { success: false, error: 'contractNotActive', errorCode: 'VALIDATION' };
      if (input.cancellation_date < contract.start_date || input.cancellation_date > contract.end_date) {
        return { success: false, error: 'cancellationDateOutOfRange', errorCode: 'VALIDATION' };
      }

      // Prorate the period that contains the cancellation date, never dropping
      // below what has already been paid (would violate paid_amount <= amount).
      if (input.cancellation_handling === 'prorate_current') {
        const current = await invoicesRepository.findPeriodContaining(id, input.cancellation_date, ctx);
        if (current) {
          const prorated = prorateAmount(
            Number(current.amount),
            current.period_start,
            current.period_end,
            input.cancellation_date
          );
          const newAmount = Math.max(prorated, Number(current.paid_amount));
          if (newAmount !== Number(current.amount)) {
            await invoicesRepository.update(current.id, { amount: newAmount }, ctx);
          }
        }
      }

      // Leave no future debt: drop unpaid future invoices outright, and for any
      // future invoice that carries payments, clamp its amount to the paid amount
      // so the outstanding balance is zero.
      await invoicesRepository.deleteFutureUnpaidByContractId(id, input.cancellation_date, ctx);
      const futurePaid = await invoicesRepository.findFuturePaidByContractId(id, input.cancellation_date, ctx);
      for (const invoice of futurePaid) {
        if (Number(invoice.amount) !== Number(invoice.paid_amount)) {
          await invoicesRepository.update(invoice.id, { amount: Number(invoice.paid_amount) }, ctx);
        }
      }

      const cancelled = await contractsRepository.cancel(id, input, ctx);
      await auditService.log(auth, 'cancel', 'contract', id, contract, cancelled, ctx);

      return { success: true, data: cancelled };
    });
  },
};
