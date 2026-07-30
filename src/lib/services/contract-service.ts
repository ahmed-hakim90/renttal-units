import { hasPermission } from '@/lib/auth/permissions';
import type {
  AuthContext,
  Contract,
  ContractCancellationHandling,
  ContractLineInput,
  PaymentCycle,
  ServiceResult,
} from '@/types/database';
import { contractsRepository } from '@/lib/repositories/contracts';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { unitsRepository } from '@/lib/repositories/units';
import { tenantsRepository } from '@/lib/repositories/tenants';
import { auditService } from '@/lib/services/audit-service';
import { validationService } from '@/lib/services/validation-service';
import { isUniqueViolation, readErrorMessage } from '@/lib/db/postgres-errors';
import { calculateContractBillingSchedule } from '@/lib/rental/calculations';
import {
  applyOpeningBalanceToSchedule,
  type ContractOpeningBalanceInput,
} from '@/lib/rental/contract-opening-balance';
import { validateContractOpeningBalance } from '@/lib/rental/validate-opening-balance';
import { logger, withSpan, type LogContext } from '@/lib/observability';

function rentalUnitIds(lines: ContractLineInput[] | undefined, fallbackUnitId?: string | null) {
  const fromLines = (lines ?? [])
    .filter((line) => line.line_type === 'rental' && line.unit_id)
    .map((line) => line.unit_id as string);
  if (fromLines.length > 0) return Array.from(new Set(fromLines));
  return fallbackUnitId ? [fallbackUnitId] : [];
}

async function createContractInvoices(
  contract: Contract,
  ctx: LogContext,
  openingBalance?: ContractOpeningBalanceInput,
) {
  if (!contract.start_date || !contract.end_date || !contract.unit_id) {
    throw new Error('Cannot create invoices for an incomplete contract');
  }
  const schedule = applyOpeningBalanceToSchedule(
    calculateContractBillingSchedule({
      start_date: contract.start_date,
      end_date: contract.end_date,
      payment_cycle: contract.payment_cycle,
      lines: (contract.lines ?? []).map((line) => ({
        contractLineId: line.id,
        lineType: line.line_type,
        unitId: line.unit_id,
        description: line.description,
        odooProductId: line.odoo_product_id,
        odooProductName: line.odoo_product_name,
        amount: Number(line.amount),
        taxRate: Number(line.tax_rate),
        sortOrder: line.sort_order,
      })),
    }),
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
        contract_id: contract.id,
        unit_id: contract.unit_id,
        tenant_id: contract.tenant_id,
        period_start: period.periodStart,
        period_end: period.periodEnd,
        amount_untaxed: period.amountUntaxed,
        amount_tax: period.amountTax,
        amount_total: period.amountTotal,
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
    tax_mode?: Contract['tax_mode'];
  }
) {
  return (
    input.start_date !== contract.start_date
    || input.end_date !== contract.end_date
    || input.payment_cycle !== contract.payment_cycle
    || (input.tax_mode ?? contract.tax_mode) !== contract.tax_mode
    || input.total_amount !== Number(contract.total_amount)
  );
}

async function syncContractTenant(
  contract: Contract,
  tenantName: string | null | undefined,
  tenantPhone: string | null | undefined,
  tenantEmail: string | null | undefined,
  tenantNationalId: string | null | undefined,
  ctx: LogContext
): Promise<ServiceResult<string>> {
  const tenantValidation = validationService.validateTenant({
    full_name: tenantName,
    phone: tenantPhone,
    email: tenantEmail,
    national_id: tenantNationalId,
  });
  if (!tenantValidation.valid || !tenantValidation.data) {
    return { success: false, error: tenantValidation.errors.join(', '), errorCode: 'VALIDATION' };
  }

  const payload = tenantValidation.data;
  const unitIds = rentalUnitIds(
    (contract.lines ?? []).map((line) => ({
      line_type: line.line_type,
      unit_id: line.unit_id,
      amount: Number(line.amount),
    })),
    contract.unit_id,
  );

  try {
    if (contract.tenant_id) {
      await tenantsRepository.update(contract.tenant_id, payload, ctx);
      for (const unitId of unitIds) {
        await unitsRepository.update(unitId, { tenant_id: contract.tenant_id }, ctx);
      }
      return { success: true, data: contract.tenant_id };
    }

    const tenant = await tenantsRepository.create(payload, ctx);
    for (const unitId of unitIds) {
      await unitsRepository.update(unitId, { tenant_id: tenant.id }, ctx);
    }
    return { success: true, data: tenant.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: 'duplicateNationalId', errorCode: 'DUPLICATE_NATIONAL_ID' };
    }
    throw error;
  }
}

export const contractService = {
  async list(auth: AuthContext, ctx: LogContext) {
    await this.completeExpired(auth, ctx);
    return contractsRepository.findAll(ctx);
  },

  async completeExpired(auth: AuthContext, ctx: LogContext) {
    if (!hasPermission(auth, 'contracts.update')) return;
    const active = await contractsRepository.findActive(ctx);
    const today = new Date().toISOString().slice(0, 10);
    const expiredIds = active
      .filter((contract) => Boolean(contract.end_date) && (contract.end_date as string) < today)
      .map((contract) => contract.id);
    await contractsRepository.markCompleted(expiredIds, ctx);
  },

  async create(
    auth: AuthContext,
    input: {
      unit_id?: string;
      lines?: ContractLineInput[];
      contract_number: string;
      start_date: string;
      end_date: string;
      total_amount?: number;
      payment_cycle: PaymentCycle;
      tax_mode?: Contract['tax_mode'];
      notes?: string | null;
      tenant_name: string;
      tenant_phone?: string | null;
      tenant_email?: string | null;
      tenant_national_id?: string | null;
      tenant_odoo_partner_id?: number | null;
      tenant_vat?: string | null;
      tenant_street?: string | null;
      tenant_city?: string | null;
      tenant_country_code?: string | null;
      sync_tenant_to_odoo?: boolean;
      paid_through_date?: string | null;
      opening_paid_amount?: number | null;
      opening_payment_date?: string | null;
      opening_notes?: string | null;
    },
    ctx: LogContext
  ): Promise<ServiceResult<Contract>> {
    if (!hasPermission(auth, 'contracts.create')) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };

    return withSpan('contractService.create', { ...ctx, service: 'contract', user_id: auth.userId }, async () => {
      const {
        tenant_name,
        tenant_phone,
        tenant_email,
        tenant_national_id,
        tenant_odoo_partner_id,
        tenant_vat,
        tenant_street,
        tenant_city,
        tenant_country_code,
        sync_tenant_to_odoo,
        paid_through_date,
        opening_paid_amount,
        opening_payment_date,
        opening_notes,
        ...contractInput
      } = input;
      const openingBalance: ContractOpeningBalanceInput = {
        paid_through_date: paid_through_date ?? null,
        opening_paid_amount: opening_paid_amount ?? null,
      };

      const validation = validationService.validateContract({
        ...contractInput,
        contract_number: String(contractInput.contract_number ?? '').trim(),
        lines: contractInput.lines,
        unit_id: contractInput.unit_id,
        total_amount: contractInput.total_amount,
      });
      if (!validation.valid || !validation.data) {
        return { success: false, error: validation.errors.join(', '), errorCode: 'VALIDATION' };
      }

      const validated = validation.data;
      let lines = validated.lines;
      const primaryUnitId = validated.unit_id;
      const totalAmount = validated.total_amount;
      const unitIds = rentalUnitIds(lines, primaryUnitId);
      const loadedUnits = new Map<string, Awaited<ReturnType<typeof unitsRepository.findById>>>();
      for (const unitId of unitIds) {
        const unit = await unitsRepository.findById(unitId, ctx);
        if (!unit) return { success: false, error: 'unitNotFound', errorCode: 'NOT_FOUND' };
        const active = await contractsRepository.findActiveByUnitId(unitId, ctx);
        if (active) return { success: false, error: 'activeContractExists', errorCode: 'ACTIVE_CONTRACT_EXISTS' };
        loadedUnits.set(unitId, unit);
      }

      const serviceProductIds = Array.from(new Set(lines
        .filter((line) => line.line_type === 'service' && line.odoo_product_id)
        .map((line) => line.odoo_product_id as number)));
      const serviceProducts = new Map<number, { id: number; display_name: string }>();
      if (serviceProductIds.length > 0) {
        try {
          const { odooService } = await import('@/lib/odoo/service');
          for (const productId of serviceProductIds) {
            const matches = await odooService.searchProducts(auth, String(productId), ctx, 1, 'service');
            const product = matches.find((item) => item.id === productId);
            if (!product) {
              return { success: false, error: 'serviceProductInvalid', errorCode: 'ODOO_SERVICE_PRODUCT_INVALID' };
            }
            serviceProducts.set(productId, { id: product.id, display_name: product.display_name });
          }
        } catch {
          return { success: false, error: 'serviceProductInvalid', errorCode: 'ODOO_SERVICE_PRODUCT_INVALID' };
        }
      }

      lines = lines.map((line) => {
        if (line.line_type === 'rental' && line.unit_id) {
          const unit = loadedUnits.get(line.unit_id);
          return {
            ...line,
            odoo_product_id: unit?.odoo_product_id ?? null,
            odoo_product_name: unit?.odoo_product_reference ?? null,
          };
        }
        if (line.line_type === 'service' && line.odoo_product_id) {
          const product = serviceProducts.get(line.odoo_product_id);
          return {
            ...line,
            odoo_product_id: product?.id ?? null,
            odoo_product_name: product?.display_name ?? null,
          };
        }
        return line;
      });

      const tenantValidation = validationService.validateTenant({
        full_name: tenant_name,
        phone: tenant_phone,
        email: tenant_email,
        national_id: tenant_national_id,
        odoo_partner_id: tenant_odoo_partner_id,
        vat: tenant_vat,
        street: tenant_street,
        city: tenant_city,
        country_code: tenant_country_code,
      });
      if (!tenantValidation.valid || !tenantValidation.data) {
        return { success: false, error: tenantValidation.errors.join(', '), errorCode: 'VALIDATION' };
      }

      const scheduleInput = {
        unit_id: primaryUnitId,
        start_date: validated.start_date,
        end_date: validated.end_date,
        total_amount: totalAmount,
        payment_cycle: validated.payment_cycle,
        tax_mode: contractInput.tax_mode ?? 'taxable',
      };

      const openingErrors = validateContractOpeningBalance(scheduleInput, openingBalance);
      if (openingErrors.length > 0) {
        return { success: false, error: openingErrors.join(', '), errorCode: 'VALIDATION' };
      }

      let schedule;
      try {
        schedule = applyOpeningBalanceToSchedule(
          calculateContractBillingSchedule({
            start_date: validated.start_date,
            end_date: validated.end_date,
            payment_cycle: validated.payment_cycle,
            lines: lines.map((line, index) => ({
              lineType: line.line_type,
              unitId: line.unit_id ?? null,
              description: line.description ?? null,
              odooProductId: line.odoo_product_id ?? null,
              odooProductName: line.odoo_product_name ?? null,
              amount: line.amount,
              taxRate: line.tax_rate ?? 0,
              sortOrder: line.sort_order ?? index,
            })),
          }),
          openingBalance,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid contract schedule';
        return { success: false, error: message, errorCode: 'VALIDATION' };
      }

      const existingNumber = await contractsRepository.findByContractNumber(
        String(validated.contract_number).trim(),
        ctx,
      );
      if (existingNumber) {
        return { success: false, error: 'duplicateContractNumber', errorCode: 'DUPLICATE_CONTRACT_NUMBER' };
      }

      if (!tenantValidation.data.odoo_partner_id && sync_tenant_to_odoo) {
        const { odooService } = await import('@/lib/odoo/service');
        const partnerResult = await odooService.findOrCreatePartnerForTenant(auth, tenantValidation.data, ctx);
        if (!partnerResult.success || !partnerResult.data) {
          return { success: false, error: partnerResult.error ?? 'odooPartnerSyncFailed', errorCode: 'ODOO_SYNC_FAILED' };
        }
        tenantValidation.data.odoo_partner_id = partnerResult.data;
      }

      let contract: Contract;
      try {
        contract = await contractsRepository.createWithScheduleAtomic({
          contract: {
            unitId: primaryUnitId,
            contractNumber: String(validated.contract_number).trim(),
            startDate: validated.start_date,
            endDate: validated.end_date,
            totalAmount,
            paymentCycle: validated.payment_cycle,
            taxMode: contractInput.tax_mode ?? 'taxable',
            paidThroughDate: paid_through_date ?? null,
            openingPaidAmount: opening_paid_amount ?? 0,
            openingPaymentDate: opening_payment_date ?? null,
            openingNotes: opening_notes ?? null,
            openingBalanceTotal: schedule.reduce((sum, period) => sum + period.paid_amount, 0),
            notes: validated.notes ?? null,
          },
          tenant: {
            fullName: tenantValidation.data.full_name,
            phone: tenantValidation.data.phone ?? null,
            email: tenantValidation.data.email ?? null,
            nationalId: tenantValidation.data.national_id ?? null,
            odooPartnerId: tenantValidation.data.odoo_partner_id ?? null,
            vat: tenantValidation.data.vat ?? null,
            street: tenantValidation.data.street ?? null,
            city: tenantValidation.data.city ?? null,
            countryCode: tenantValidation.data.country_code ?? null,
          },
          schedule: schedule.map((period) => ({
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            amount: period.amount,
            amountUntaxed: period.amountUntaxed,
            amountTax: period.amountTax,
            amountTotal: period.amountTotal,
            paidAmount: period.paid_amount,
            status: period.status,
            dueDate: period.periodStart,
            lineItems: period.lineItems,
          })),
          lines: lines.map((line, index) => ({
            line_type: line.line_type,
            unit_id: line.unit_id ?? null,
            description: line.description ?? null,
            amount: line.amount,
            period_start: line.period_start ?? validated.start_date,
            period_end: line.period_end ?? validated.end_date,
            odoo_line_id: line.odoo_line_id ?? null,
            odoo_product_id: line.odoo_product_id ?? null,
            odoo_product_name: line.odoo_product_name ?? null,
            tax_rate: line.tax_rate ?? 0,
            sort_order: line.sort_order ?? index,
          })),
        }, ctx);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isUniqueViolation(error) || message.includes('ACTIVE_CONTRACT_EXISTS') || message.includes('DUPLICATE_CONTRACT_NUMBER')) {
          for (const unitId of unitIds) {
            const active2 = await contractsRepository.findActiveByUnitId(unitId, ctx);
            if (active2) return { success: false, error: 'activeContractExists', errorCode: 'ACTIVE_CONTRACT_EXISTS' };
          }
          return { success: false, error: 'duplicateContractNumber', errorCode: 'DUPLICATE_CONTRACT_NUMBER' };
        }
        logger.error('Failed to create contract', {
          ...ctx,
          service: 'contract',
          operation: 'create',
          user_id: auth.userId,
          error: message,
        });
        return { success: false, error: 'contractCreateFailed', errorCode: 'INTERNAL' };
      }

      await auditService.log(auth, 'create', 'contract', contract.id, null, contract, ctx);
      return { success: true, data: contract };
    });
  },

  async update(
    auth: AuthContext,
    id: string,
    input: {
      contract_number: string;
      start_date: string;
      end_date: string;
      total_amount?: number;
      payment_cycle: PaymentCycle;
      tax_mode?: Contract['tax_mode'];
      notes?: string | null;
      lines?: ContractLineInput[];
      tenant_name: string;
      tenant_phone?: string | null;
      tenant_email?: string | null;
      tenant_national_id?: string | null;
    },
    ctx: LogContext
  ): Promise<ServiceResult<Contract>> {
    if (!hasPermission(auth, 'contracts.update')) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };

    return withSpan('contractService.update', { ...ctx, service: 'contract', user_id: auth.userId }, async () => {
      const {
        tenant_name,
        tenant_phone,
        tenant_email,
        tenant_national_id,
        ...contractInput
      } = input;

      const contract = await contractsRepository.findById(id, ctx);
      if (!contract) return { success: false, error: 'contractNotFound', errorCode: 'NOT_FOUND' };
      if (contract.status !== 'active') return { success: false, error: 'contractNotActive', errorCode: 'VALIDATION' };

      const validation = validationService.validateContract({
        ...contractInput,
        unit_id: contract.unit_id,
        contract_number: String(contractInput.contract_number ?? '').trim(),
        lines: contractInput.lines ?? (contract.lines ?? []).map((line) => ({
          line_type: line.line_type,
          unit_id: line.unit_id,
          description: line.description,
          amount: Number(line.amount),
          period_start: line.period_start,
          period_end: line.period_end,
          odoo_line_id: line.odoo_line_id,
          odoo_product_id: line.odoo_product_id,
          odoo_product_name: line.odoo_product_name,
          tax_rate: Number(line.tax_rate),
          sort_order: line.sort_order,
        })),
        total_amount: contractInput.total_amount ?? Number(contract.total_amount),
      });
      if (!validation.valid || !validation.data) {
        return { success: false, error: validation.errors.join(', '), errorCode: 'VALIDATION' };
      }

      const validated = validation.data;
      const invoices = await invoicesRepository.findByContractId(id, ctx);
      const scheduleFieldsChanged = scheduleChanged(contract, {
        start_date: validated.start_date,
        end_date: validated.end_date,
        total_amount: validated.total_amount,
        payment_cycle: validated.payment_cycle,
        tax_mode: contractInput.tax_mode,
      });

      if (scheduleFieldsChanged && hasFinancialActivity(invoices)) {
        return { success: false, error: 'contractHasFinancialActivity', errorCode: 'VALIDATION' };
      }

      for (const unitId of rentalUnitIds(validated.lines, validated.unit_id)) {
        const active = await contractsRepository.findActiveByUnitId(unitId, ctx);
        if (active && active.id !== id) {
          return { success: false, error: 'activeContractExists', errorCode: 'ACTIVE_CONTRACT_EXISTS' };
        }
      }

      const tenantResult = await syncContractTenant(
        {
          ...contract,
          lines: validated.lines.map((line, index) => ({
            id: `temp-${index}`,
            contract_id: id,
            line_type: line.line_type,
            unit_id: line.unit_id ?? null,
            description: line.description ?? null,
            amount: line.amount,
            period_start: line.period_start ?? null,
            period_end: line.period_end ?? null,
            odoo_line_id: line.odoo_line_id ?? null,
            odoo_product_id: line.odoo_product_id ?? null,
            odoo_product_name: line.odoo_product_name ?? null,
            tax_rate: line.tax_rate ?? 0,
            sort_order: line.sort_order ?? index,
            created_at: contract.created_at,
            updated_at: contract.updated_at,
          })),
        },
        tenant_name,
        tenant_phone,
        tenant_email,
        tenant_national_id,
        ctx,
      );
      if (!tenantResult.success || !tenantResult.data) {
        return { success: false, error: tenantResult.error, errorCode: tenantResult.errorCode };
      }

      let updated: Contract;
      try {
        await contractsRepository.replaceLinesAtomic(id, validated.lines.map((line, index) => ({
          line_type: line.line_type,
          unit_id: line.unit_id ?? null,
          description: line.description ?? null,
          amount: line.amount,
          period_start: line.period_start ?? validated.start_date,
          period_end: line.period_end ?? validated.end_date,
          odoo_line_id: line.odoo_line_id ?? null,
          odoo_product_id: line.odoo_product_id ?? null,
          odoo_product_name: line.odoo_product_name ?? null,
          tax_rate: line.tax_rate ?? 0,
          sort_order: line.sort_order ?? index,
        })), ctx);

        updated = await contractsRepository.update(id, {
          contract_number: String(validated.contract_number).trim(),
          start_date: validated.start_date,
          end_date: validated.end_date,
          total_amount: validated.total_amount,
          payment_cycle: validated.payment_cycle,
          tax_mode: contractInput.tax_mode ?? contract.tax_mode,
          notes: validated.notes ?? null,
          tenant_id: tenantResult.data,
          unit_id: validated.unit_id,
        }, ctx);
      } catch (error) {
        if (isUniqueViolation(error)) {
          return { success: false, error: 'duplicateContractNumber', errorCode: 'DUPLICATE_CONTRACT_NUMBER' };
        }
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('ACTIVE_CONTRACT_EXISTS')) {
          return { success: false, error: 'activeContractExists', errorCode: 'ACTIVE_CONTRACT_EXISTS' };
        }
        throw error;
      }

      if (scheduleFieldsChanged) {
        if (!updated.start_date || !updated.end_date) {
          return { success: false, error: 'validationFailed', errorCode: 'VALIDATION' };
        }
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
    if (!hasPermission(auth, 'contracts.update')) return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };

    return withSpan('contractService.cancel', { ...ctx, service: 'contract', user_id: auth.userId }, async () => {
      const validation = validationService.validateCancelContract(input);
      if (!validation.valid) return { success: false, error: validation.errors.join(', '), errorCode: 'VALIDATION' };

      const contract = await contractsRepository.findById(id, ctx);
      if (!contract) return { success: false, error: 'contractNotFound', errorCode: 'NOT_FOUND' };
      if (contract.status !== 'active') return { success: false, error: 'contractNotActive', errorCode: 'VALIDATION' };
      if (
        !contract.start_date
        || !contract.end_date
        || input.cancellation_date < contract.start_date
        || input.cancellation_date > contract.end_date
      ) {
        return { success: false, error: 'cancellationDateOutOfRange', errorCode: 'VALIDATION' };
      }

      try {
        await contractsRepository.cancel(id, input, ctx);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('FORBIDDEN')) {
          return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };
        }
        if (message.includes('CONTRACT_NOT_FOUND')) {
          return { success: false, error: 'contractNotFound', errorCode: 'NOT_FOUND' };
        }
        if (message.includes('CONTRACT_NOT_ACTIVE')) {
          return { success: false, error: 'contractNotActive', errorCode: 'VALIDATION' };
        }
        if (message.includes('CANCELLATION_DATE_OUT_OF_RANGE')) {
          return { success: false, error: 'cancellationDateOutOfRange', errorCode: 'VALIDATION' };
        }
        if (message.includes('CANCELLATION_HAS_ISSUED_INVOICES')) {
          return { success: false, error: 'cancellationHasIssuedInvoices', errorCode: 'VALIDATION' };
        }
        if (message.includes('CANCELLATION_REQUIRES_SETTLEMENT')) {
          return { success: false, error: 'cancellationRequiresSettlement', errorCode: 'VALIDATION' };
        }

        logger.error('Failed to cancel contract', {
          ...ctx,
          service: 'contract',
          operation: 'cancel',
          user_id: auth.userId,
          error: message,
        });
        return { success: false, error: 'contractCancellationFailed', errorCode: 'INTERNAL' };
      }

      const cancelled = await contractsRepository.findById(id, ctx);
      if (!cancelled) {
        return { success: false, error: 'contractCancellationFailed', errorCode: 'INTERNAL' };
      }
      return { success: true, data: cancelled };
    });
  },

  async saveDraft(
    auth: AuthContext,
    input: {
      contractId?: string | null;
      unit_id?: string | null;
      lines?: ContractLineInput[];
      contract_number: string;
      start_date?: string | null;
      end_date?: string | null;
      total_amount?: number;
      payment_cycle?: PaymentCycle;
      tax_mode?: Contract['tax_mode'];
      notes?: string | null;
      tenant_name?: string | null;
      tenant_phone?: string | null;
      tenant_email?: string | null;
      tenant_national_id?: string | null;
      tenant_odoo_partner_id?: number | null;
      tenant_vat?: string | null;
      tenant_street?: string | null;
      tenant_city?: string | null;
      tenant_country_code?: string | null;
      paid_through_date?: string | null;
      opening_paid_amount?: number | null;
      opening_payment_date?: string | null;
      opening_notes?: string | null;
    },
    ctx: LogContext,
  ): Promise<ServiceResult<Contract>> {
    const isCreate = !input.contractId;
    if (isCreate && !hasPermission(auth, 'contracts.create')) {
      return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };
    }
    if (!isCreate && !hasPermission(auth, 'contracts.update')) {
      return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };
    }

    return withSpan('contractService.saveDraft', { ...ctx, service: 'contract', user_id: auth.userId }, async () => {
      if (input.contractId) {
        const existing = await contractsRepository.findById(input.contractId, ctx);
        if (!existing) return { success: false, error: 'contractNotFound', errorCode: 'NOT_FOUND' };
        if (existing.status !== 'draft') {
          return { success: false, error: 'contractNotDraft', errorCode: 'VALIDATION' };
        }
      }

      const validation = validationService.validateContractDraft({
        unit_id: input.unit_id,
        contract_number: String(input.contract_number ?? '').trim(),
        start_date: input.start_date,
        end_date: input.end_date,
        total_amount: input.total_amount,
        payment_cycle: input.payment_cycle,
        tax_mode: input.tax_mode,
        notes: input.notes,
        lines: input.lines,
      });
      if (!validation.valid || !validation.data) {
        return { success: false, error: validation.errors.join(', '), errorCode: 'VALIDATION' };
      }

      const tenantValidation = validationService.validateOptionalTenant({
        full_name: input.tenant_name,
        phone: input.tenant_phone,
        email: input.tenant_email,
        national_id: input.tenant_national_id,
        odoo_partner_id: input.tenant_odoo_partner_id,
        vat: input.tenant_vat,
        street: input.tenant_street,
        city: input.tenant_city,
        country_code: input.tenant_country_code,
      });
      if (!tenantValidation.valid || !tenantValidation.data) {
        return { success: false, error: tenantValidation.errors.join(', '), errorCode: 'VALIDATION' };
      }

      try {
        const contract = await contractsRepository.saveDraftAtomic({
          contractId: input.contractId ?? null,
          contract: {
            contractNumber: String(validation.data.contract_number).trim(),
            startDate: validation.data.start_date,
            endDate: validation.data.end_date,
            paymentCycle: validation.data.payment_cycle,
            taxMode: input.tax_mode ?? 'taxable',
            paidThroughDate: input.paid_through_date ?? null,
            openingPaidAmount: input.opening_paid_amount ?? 0,
            openingPaymentDate: input.opening_payment_date ?? null,
            openingNotes: input.opening_notes ?? null,
            openingBalanceTotal: 0,
            notes: validation.data.notes ?? null,
          },
          tenant: tenantValidation.data.full_name
            ? {
                fullName: tenantValidation.data.full_name,
                phone: tenantValidation.data.phone,
                email: tenantValidation.data.email,
                nationalId: tenantValidation.data.national_id,
                odooPartnerId: tenantValidation.data.odoo_partner_id,
                vat: tenantValidation.data.vat,
                street: tenantValidation.data.street,
                city: tenantValidation.data.city,
                countryCode: tenantValidation.data.country_code,
              }
            : null,
          lines: validation.data.lines.map((line, index) => ({
            line_type: line.line_type,
            unit_id: line.unit_id ?? null,
            description: line.description ?? null,
            amount: line.amount,
            period_start: line.period_start ?? validation.data.start_date,
            period_end: line.period_end ?? validation.data.end_date,
            odoo_line_id: line.odoo_line_id ?? null,
            odoo_product_id: line.odoo_product_id ?? null,
            odoo_product_name: line.odoo_product_name ?? null,
            tax_rate: line.tax_rate ?? 0,
            sort_order: line.sort_order ?? index,
          })),
        }, ctx);

        await auditService.log(
          auth,
          'draft_saved',
          'contract',
          contract.id,
          null,
          contract,
          ctx,
        );
        return { success: true, data: contract };
      } catch (error) {
        const message = readErrorMessage(error);
        if (message.includes('DUPLICATE_CONTRACT_NUMBER') || message.includes('contracts_contract_number_unique')) {
          return { success: false, error: 'duplicateContractNumber', errorCode: 'DUPLICATE_CONTRACT_NUMBER' };
        }
        if (message.includes('CONTRACT_NOT_DRAFT')) {
          return { success: false, error: 'contractNotDraft', errorCode: 'VALIDATION' };
        }
        if (message.includes('FORBIDDEN')) {
          return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };
        }
        if (message.includes('ACTIVE_CONTRACT_EXISTS')) {
          return { success: false, error: 'activeContractExists', errorCode: 'ACTIVE_CONTRACT_EXISTS' };
        }
        if (
          message.includes('idx_tenants_national_id_unique')
          || message.includes('duplicate key') && message.includes('national_id')
        ) {
          return { success: false, error: 'duplicateNationalId', errorCode: 'DUPLICATE_NATIONAL_ID' };
        }
        if (
          message.includes('contracts_paid_through_in_period')
          || message.includes('contracts_opening_payment_in_period')
        ) {
          return { success: false, error: 'openingBalanceOutOfRange', errorCode: 'VALIDATION' };
        }
        if (message.includes('reasonable_contract_dates')) {
          return { success: false, error: 'contractDatesInvalid', errorCode: 'VALIDATION' };
        }
        logger.error('Failed to save contract draft', {
          ...ctx,
          service: 'contract',
          operation: 'saveDraft',
          user_id: auth.userId,
          error: message,
        });
        return { success: false, error: 'contractDraftSaveFailed', errorCode: 'INTERNAL' };
      }
    });
  },

  async activateDraft(
    auth: AuthContext,
    contractId: string,
    input: {
      unit_id?: string;
      lines?: ContractLineInput[];
      contract_number: string;
      start_date: string;
      end_date: string;
      total_amount?: number;
      payment_cycle: PaymentCycle;
      tax_mode?: Contract['tax_mode'];
      notes?: string | null;
      tenant_name: string;
      tenant_phone?: string | null;
      tenant_email?: string | null;
      tenant_national_id?: string | null;
      tenant_odoo_partner_id?: number | null;
      tenant_vat?: string | null;
      tenant_street?: string | null;
      tenant_city?: string | null;
      tenant_country_code?: string | null;
      sync_tenant_to_odoo?: boolean;
      paid_through_date?: string | null;
      opening_paid_amount?: number | null;
      opening_payment_date?: string | null;
      opening_notes?: string | null;
    },
    ctx: LogContext,
  ): Promise<ServiceResult<Contract>> {
    if (!hasPermission(auth, 'contracts.create') && !hasPermission(auth, 'contracts.update')) {
      return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };
    }

    return withSpan('contractService.activateDraft', { ...ctx, service: 'contract', user_id: auth.userId }, async () => {
      const existing = await contractsRepository.findById(contractId, ctx);
      if (!existing) return { success: false, error: 'contractNotFound', errorCode: 'NOT_FOUND' };
      if (existing.status !== 'draft') {
        return { success: false, error: 'contractNotDraft', errorCode: 'VALIDATION' };
      }

      const {
        tenant_name,
        tenant_phone,
        tenant_email,
        tenant_national_id,
        tenant_odoo_partner_id,
        tenant_vat,
        tenant_street,
        tenant_city,
        tenant_country_code,
        sync_tenant_to_odoo,
        paid_through_date,
        opening_paid_amount,
        opening_payment_date,
        opening_notes,
        ...contractInput
      } = input;
      const openingBalance: ContractOpeningBalanceInput = {
        paid_through_date: paid_through_date ?? null,
        opening_paid_amount: opening_paid_amount ?? null,
      };

      const validation = validationService.validateContract({
        ...contractInput,
        contract_number: String(contractInput.contract_number ?? '').trim(),
        lines: contractInput.lines,
        unit_id: contractInput.unit_id,
        total_amount: contractInput.total_amount,
      });
      if (!validation.valid || !validation.data) {
        return { success: false, error: validation.errors.join(', '), errorCode: 'VALIDATION' };
      }

      const validated = validation.data;
      let lines = validated.lines;
      const primaryUnitId = validated.unit_id;
      const totalAmount = validated.total_amount;
      const unitIds = rentalUnitIds(lines, primaryUnitId);
      const loadedUnits = new Map<string, Awaited<ReturnType<typeof unitsRepository.findById>>>();
      for (const unitId of unitIds) {
        const unit = await unitsRepository.findById(unitId, ctx);
        if (!unit) return { success: false, error: 'unitNotFound', errorCode: 'NOT_FOUND' };
        const active = await contractsRepository.findActiveByUnitId(unitId, ctx);
        if (active) return { success: false, error: 'activeContractExists', errorCode: 'ACTIVE_CONTRACT_EXISTS' };
        loadedUnits.set(unitId, unit);
      }

      const serviceProductIds = Array.from(new Set(lines
        .filter((line) => line.line_type === 'service' && line.odoo_product_id)
        .map((line) => line.odoo_product_id as number)));
      const serviceProducts = new Map<number, { id: number; display_name: string }>();
      if (serviceProductIds.length > 0) {
        try {
          const { odooService } = await import('@/lib/odoo/service');
          for (const productId of serviceProductIds) {
            const matches = await odooService.searchProducts(auth, String(productId), ctx, 1, 'service');
            const product = matches.find((item) => item.id === productId);
            if (!product) {
              return { success: false, error: 'serviceProductInvalid', errorCode: 'ODOO_SERVICE_PRODUCT_INVALID' };
            }
            serviceProducts.set(productId, { id: product.id, display_name: product.display_name });
          }
        } catch {
          return { success: false, error: 'serviceProductInvalid', errorCode: 'ODOO_SERVICE_PRODUCT_INVALID' };
        }
      }

      lines = lines.map((line) => {
        if (line.line_type === 'rental' && line.unit_id) {
          const unit = loadedUnits.get(line.unit_id);
          return {
            ...line,
            odoo_product_id: unit?.odoo_product_id ?? null,
            odoo_product_name: unit?.odoo_product_reference ?? null,
          };
        }
        if (line.line_type === 'service' && line.odoo_product_id) {
          const product = serviceProducts.get(line.odoo_product_id);
          return {
            ...line,
            odoo_product_id: product?.id ?? null,
            odoo_product_name: product?.display_name ?? null,
          };
        }
        return line;
      });

      const tenantValidation = validationService.validateTenant({
        full_name: tenant_name,
        phone: tenant_phone,
        email: tenant_email,
        national_id: tenant_national_id,
        odoo_partner_id: tenant_odoo_partner_id,
        vat: tenant_vat,
        street: tenant_street,
        city: tenant_city,
        country_code: tenant_country_code,
      });
      if (!tenantValidation.valid || !tenantValidation.data) {
        return { success: false, error: tenantValidation.errors.join(', '), errorCode: 'VALIDATION' };
      }

      const scheduleInput = {
        unit_id: primaryUnitId,
        start_date: validated.start_date,
        end_date: validated.end_date,
        total_amount: totalAmount,
        payment_cycle: validated.payment_cycle,
        tax_mode: contractInput.tax_mode ?? 'taxable',
      };
      const openingErrors = validateContractOpeningBalance(scheduleInput, openingBalance);
      if (openingErrors.length > 0) {
        return { success: false, error: openingErrors.join(', '), errorCode: 'VALIDATION' };
      }

      let schedule;
      try {
        schedule = applyOpeningBalanceToSchedule(
          calculateContractBillingSchedule({
            start_date: validated.start_date,
            end_date: validated.end_date,
            payment_cycle: validated.payment_cycle,
            lines: lines.map((line, index) => ({
              lineType: line.line_type,
              unitId: line.unit_id ?? null,
              description: line.description ?? null,
              odooProductId: line.odoo_product_id ?? null,
              odooProductName: line.odoo_product_name ?? null,
              amount: line.amount,
              taxRate: line.tax_rate ?? 0,
              sortOrder: line.sort_order ?? index,
            })),
          }),
          openingBalance,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid contract schedule';
        return { success: false, error: message, errorCode: 'VALIDATION' };
      }

      if (!tenantValidation.data.odoo_partner_id && sync_tenant_to_odoo) {
        const { odooService } = await import('@/lib/odoo/service');
        const partnerResult = await odooService.findOrCreatePartnerForTenant(auth, tenantValidation.data, ctx);
        if (!partnerResult.success || !partnerResult.data) {
          return { success: false, error: partnerResult.error ?? 'odooPartnerSyncFailed', errorCode: 'ODOO_SYNC_FAILED' };
        }
        tenantValidation.data.odoo_partner_id = partnerResult.data;
      }

      try {
        const contract = await contractsRepository.activateDraftAtomic({
          contractId,
          contract: {
            contractNumber: String(validated.contract_number).trim(),
            startDate: validated.start_date,
            endDate: validated.end_date,
            totalAmount,
            paymentCycle: validated.payment_cycle,
            taxMode: contractInput.tax_mode ?? 'taxable',
            paidThroughDate: paid_through_date ?? null,
            openingPaidAmount: opening_paid_amount ?? 0,
            openingPaymentDate: opening_payment_date ?? null,
            openingNotes: opening_notes ?? null,
            openingBalanceTotal: schedule.reduce((sum, period) => sum + period.paid_amount, 0),
            notes: validated.notes ?? null,
          },
          tenant: {
            fullName: tenantValidation.data.full_name,
            phone: tenantValidation.data.phone ?? null,
            email: tenantValidation.data.email ?? null,
            nationalId: tenantValidation.data.national_id ?? null,
            odooPartnerId: tenantValidation.data.odoo_partner_id ?? null,
            vat: tenantValidation.data.vat ?? null,
            street: tenantValidation.data.street ?? null,
            city: tenantValidation.data.city ?? null,
            countryCode: tenantValidation.data.country_code ?? null,
          },
          schedule: schedule.map((period) => ({
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            amount: period.amount,
            amountUntaxed: period.amountUntaxed,
            amountTax: period.amountTax,
            amountTotal: period.amountTotal,
            paidAmount: period.paid_amount,
            status: period.status,
            dueDate: period.periodStart,
            lineItems: period.lineItems,
          })),
          lines: lines.map((line, index) => ({
            line_type: line.line_type,
            unit_id: line.unit_id ?? null,
            description: line.description ?? null,
            amount: line.amount,
            period_start: line.period_start ?? validated.start_date,
            period_end: line.period_end ?? validated.end_date,
            odoo_line_id: line.odoo_line_id ?? null,
            odoo_product_id: line.odoo_product_id ?? null,
            odoo_product_name: line.odoo_product_name ?? null,
            tax_rate: line.tax_rate ?? 0,
            sort_order: line.sort_order ?? index,
          })),
        }, ctx);

        await auditService.log(auth, 'activated', 'contract', contract.id, existing, contract, ctx);
        return { success: true, data: contract };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isUniqueViolation(error) || message.includes('ACTIVE_CONTRACT_EXISTS') || message.includes('DUPLICATE_CONTRACT_NUMBER')) {
          for (const unitId of unitIds) {
            const active2 = await contractsRepository.findActiveByUnitId(unitId, ctx);
            if (active2) return { success: false, error: 'activeContractExists', errorCode: 'ACTIVE_CONTRACT_EXISTS' };
          }
          return { success: false, error: 'duplicateContractNumber', errorCode: 'DUPLICATE_CONTRACT_NUMBER' };
        }
        logger.error('Failed to activate contract draft', {
          ...ctx,
          service: 'contract',
          operation: 'activateDraft',
          user_id: auth.userId,
          error: message,
        });
        return { success: false, error: 'contractActivateFailed', errorCode: 'INTERNAL' };
      }
    });
  },

  async deleteDraft(
    auth: AuthContext,
    contractId: string,
    ctx: LogContext,
  ): Promise<ServiceResult<{ id: string }>> {
    if (!hasPermission(auth, 'contracts.update')) {
      return { success: false, error: 'Unauthorized', errorCode: 'FORBIDDEN' };
    }

    return withSpan('contractService.deleteDraft', { ...ctx, service: 'contract', user_id: auth.userId }, async () => {
      const existing = await contractsRepository.findById(contractId, ctx);
      if (!existing) return { success: false, error: 'contractNotFound', errorCode: 'NOT_FOUND' };
      if (existing.status !== 'draft') {
        return { success: false, error: 'contractNotDraft', errorCode: 'VALIDATION' };
      }

      try {
        await contractsRepository.deleteDraftAtomic(contractId, ctx);
        await auditService.log(auth, 'draft_deleted', 'contract', contractId, existing, null, ctx);
        return { success: true, data: { id: contractId } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('CONTRACT_NOT_DRAFT')) {
          return { success: false, error: 'contractNotDraft', errorCode: 'VALIDATION' };
        }
        if (message.includes('CONTRACT_HAS_INVOICES')) {
          return { success: false, error: 'contractHasFinancialActivity', errorCode: 'VALIDATION' };
        }
        logger.error('Failed to delete contract draft', {
          ...ctx,
          service: 'contract',
          operation: 'deleteDraft',
          user_id: auth.userId,
          error: message,
        });
        return { success: false, error: 'contractDraftDeleteFailed', errorCode: 'INTERNAL' };
      }
    });
  },
};
