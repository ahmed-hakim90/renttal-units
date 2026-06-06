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
import { calculateContractPaymentSchedule } from '@/lib/rental/calculations';
import { withSpan, type LogContext } from '@/lib/observability';

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
  );
}

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

async function createContractInvoices(contract: Contract, ctx: LogContext) {
  const schedule = calculateContractPaymentSchedule(contract);
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
        invoice_number: `DUE-${contract.id.slice(0, 8)}-${period.periodStart}`,
        contract_id: contract.id,
        unit_id: contract.unit_id,
        tenant_id: null,
        period_start: period.periodStart,
        period_end: period.periodEnd,
        amount: period.amount,
        paid_amount: 0,
        status: 'due',
        due_date: period.periodStart,
        issued_at: null,
        notes: null,
      }, ctx);
      created++;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const duplicate = await invoicesRepository.findByUnitAndPeriod(
        contract.unit_id,
        period.periodStart,
        period.periodEnd,
        ctx,
        contract.id
      );
      if (!duplicate) throw error;
    }
  }

  return created;
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
    },
    ctx: LogContext
  ): Promise<ServiceResult<Contract>> {
    if (!auth.isAdminEditor) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };

    return withSpan('contractService.create', { ...ctx, service: 'contract', user_id: auth.userId }, async () => {
      const { tenant_name, tenant_phone, tenant_email, ...contractInput } = input;

      const validation = validationService.validateContract(contractInput);
      if (!validation.valid) return { success: false, error: validation.errors.join(', '), errorCode: 'VALIDATION' };

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

      await createContractInvoices(contract, ctx);
      await unitsRepository.update(input.unit_id, { status: 'occupied' }, ctx);
      await auditService.log(auth, 'create', 'contract', contract.id, null, contract, ctx);

      const hydrated = await contractsRepository.findById(contract.id, ctx);
      return { success: true, data: hydrated ?? contract };
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

      if (input.cancellation_handling === 'prorate_current') {
        const current = await invoicesRepository.findCurrentDueByContractId(id, input.cancellation_date, ctx);
        if (current) {
          await invoicesRepository.update(current.id, {
            amount: prorateAmount(
              Number(current.amount),
              current.period_start,
              current.period_end,
              input.cancellation_date
            ),
          }, ctx);
        }
      }

      await invoicesRepository.deleteFutureDueByContractId(id, input.cancellation_date, ctx);
      const cancelled = await contractsRepository.cancel(id, input, ctx);
      await unitsRepository.update(contract.unit_id, { status: 'vacant' }, ctx);
      await auditService.log(auth, 'cancel', 'contract', id, contract, cancelled, ctx);

      return { success: true, data: cancelled };
    });
  },
};
