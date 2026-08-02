'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type {
  ContractCancellationHandling,
  ContractLineInput,
  ContractPaymentCondition,
  ContractTaxMode,
  PaymentCycle,
} from '@/types/database';
import { hasPermission } from '@/lib/auth/permissions';
import { requireAuth, requirePermission } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { contractService } from '@/lib/services/contract-service';
import { featureDisabledResult } from '@/lib/features';
import {
  shouldBlockMultiLineCreate,
  shouldBlockMultiLineUpdate,
  shouldBlockOpeningBalanceInput,
} from '@/lib/features/guards';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';
import { contractsRepository } from '@/lib/repositories/contracts';

const contractIdSchema = z.string().uuid();

async function getCtx() {
  return { correlation_id: await getCorrelationId() };
}

function revalidateContractViews(locale: string, contractId?: string) {
  revalidatePath(`/${locale}/contracts`);
  revalidatePath(`/${locale}/contracts/new`);
  if (contractId) {
    revalidatePath(`/${locale}/contracts/${contractId}`);
    revalidatePath(`/${locale}/contracts/${contractId}/edit`);
  }
  revalidatePath(`/${locale}/units`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/due-this-month`);
  revalidatePath(`/${locale}/invoices`);
  revalidatePath(`/${locale}/reports/debt-aging`);
}

export async function getContract(locale: string, contractId: string) {
  const auth = await requirePermission(locale, 'contracts.view', await getCtx());
  if (!contractIdSchema.safeParse(contractId).success) return null;
  return contractsRepository.findById(contractId, {
    ...(await getCtx()),
    user_id: auth.userId,
    role: auth.role,
  });
}

export async function getContracts(locale: string) {
  const auth = await requirePermission(locale, 'contracts.view', await getCtx());
  return contractService.list(auth, { ...(await getCtx()), user_id: auth.userId, role: auth.role });
}

export async function getContractsPage(
  locale: string,
  filters?: { page?: number; pageSize?: number },
) {
  const auth = await requirePermission(locale, 'contracts.view', await getCtx());
  return contractService.listPage(
    auth,
    { ...(await getCtx()), user_id: auth.userId, role: auth.role },
    filters,
  );
}

export async function createContract(locale: string, data: {
  unit_id?: string;
  lines?: ContractLineInput[];
  contract_number: string;
  start_date: string;
  end_date: string;
  total_amount?: number;
  payment_cycle: PaymentCycle;
  tax_mode?: ContractTaxMode;
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
  historical_last_payment_amount?: number | null;
  historical_last_payment_reference?: string | null;
  payment_conditions?: ContractPaymentCondition[];
}) {
  const auth = await requirePermission(locale, 'contracts.create', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const flags = await loadFeatureFlags(ctx);

  if (shouldBlockOpeningBalanceInput(flags.contracts_opening_balance, data)) {
    return featureDisabledResult();
  }
  if (shouldBlockMultiLineCreate(flags.contracts_multi_line, data.lines)) {
    return featureDisabledResult();
  }

  const result = await contractService.create(auth, {
    ...data,
    paid_through_date: flags.contracts_opening_balance ? data.paid_through_date : null,
    opening_paid_amount: flags.contracts_opening_balance ? data.opening_paid_amount : null,
    opening_payment_date: flags.contracts_opening_balance ? data.opening_payment_date : null,
    opening_notes: flags.contracts_opening_balance ? data.opening_notes : null,
    historical_last_payment_amount: flags.contracts_opening_balance
      ? data.historical_last_payment_amount
      : null,
    historical_last_payment_reference: flags.contracts_opening_balance
      ? data.historical_last_payment_reference
      : null,
  }, ctx);
  if (result.success) revalidateContractViews(locale);
  return result;
}

export async function updateContract(locale: string, id: string, data: {
  contract_number: string;
  start_date: string;
  end_date: string;
  total_amount?: number;
  payment_cycle: PaymentCycle;
  tax_mode?: ContractTaxMode;
  notes?: string | null;
  lines?: ContractLineInput[];
  tenant_name: string;
  tenant_phone?: string | null;
  tenant_email?: string | null;
  tenant_national_id?: string | null;
  payment_conditions?: ContractPaymentCondition[];
}) {
  const auth = await requirePermission(locale, 'contracts.update', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const flags = await loadFeatureFlags(ctx);

  if (data.lines !== undefined && !flags.contracts_multi_line) {
    const existing = await contractsRepository.findById(id, ctx);
    // Allow non-line updates and preserve existing multi-line contracts without expanding further.
    if (shouldBlockMultiLineUpdate(flags.contracts_multi_line, existing?.lines, data.lines)) {
      return featureDisabledResult();
    }
  }

  const result = await contractService.update(auth, id, data, ctx);
  if (result.success) revalidateContractViews(locale, id);
  return result;
}

export async function cancelContract(locale: string, id: string, data: {
  cancellation_date: string;
  cancellation_handling: ContractCancellationHandling;
}) {
  const auth = await requirePermission(locale, 'contracts.update', await getCtx());
  const result = await contractService.cancel(auth, id, data, { ...(await getCtx()), user_id: auth.userId, role: auth.role });
  if (result.success) revalidateContractViews(locale, id);
  return result;
}

type ContractDraftPayload = {
  contractId?: string | null;
  unit_id?: string;
  lines?: ContractLineInput[];
  contract_number: string;
  start_date?: string | null;
  end_date?: string | null;
  total_amount?: number;
  payment_cycle?: PaymentCycle;
  tax_mode?: ContractTaxMode;
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
  historical_last_payment_amount?: number | null;
  historical_last_payment_reference?: string | null;
  payment_conditions?: ContractPaymentCondition[];
};

export async function saveContractDraft(locale: string, data: ContractDraftPayload) {
  const isCreate = !data.contractId;
  const auth = await requirePermission(
    locale,
    isCreate ? 'contracts.create' : 'contracts.update',
    await getCtx(),
  );
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const flags = await loadFeatureFlags(ctx);

  if (shouldBlockOpeningBalanceInput(flags.contracts_opening_balance, data)) {
    return featureDisabledResult();
  }
  if (shouldBlockMultiLineCreate(flags.contracts_multi_line, data.lines)) {
    return featureDisabledResult();
  }

  const result = await contractService.saveDraft(auth, {
    ...data,
    paid_through_date: flags.contracts_opening_balance ? data.paid_through_date : null,
    opening_paid_amount: flags.contracts_opening_balance ? data.opening_paid_amount : null,
    opening_payment_date: flags.contracts_opening_balance ? data.opening_payment_date : null,
    opening_notes: flags.contracts_opening_balance ? data.opening_notes : null,
    historical_last_payment_amount: flags.contracts_opening_balance
      ? data.historical_last_payment_amount
      : null,
    historical_last_payment_reference: flags.contracts_opening_balance
      ? data.historical_last_payment_reference
      : null,
  }, ctx);
  if (result.success) revalidateContractViews(locale, result.data?.id);
  return result;
}

export async function activateContract(locale: string, contractId: string, data: {
  unit_id?: string;
  lines?: ContractLineInput[];
  contract_number: string;
  start_date: string;
  end_date: string;
  total_amount?: number;
  payment_cycle: PaymentCycle;
  tax_mode?: ContractTaxMode;
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
  historical_last_payment_amount?: number | null;
  historical_last_payment_reference?: string | null;
  payment_conditions?: ContractPaymentCondition[];
}) {
  if (!contractIdSchema.safeParse(contractId).success) {
    return { success: false as const, error: 'contractNotFound', errorCode: 'NOT_FOUND' as const };
  }

  const auth = await requireAuth(locale, await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  if (!hasPermission(auth, 'contracts.update') && !hasPermission(auth, 'contracts.create')) {
    return { success: false as const, error: 'Unauthorized', errorCode: 'FORBIDDEN' as const };
  }

  const flags = await loadFeatureFlags(ctx);

  if (shouldBlockOpeningBalanceInput(flags.contracts_opening_balance, data)) {
    return featureDisabledResult();
  }
  if (shouldBlockMultiLineCreate(flags.contracts_multi_line, data.lines)) {
    return featureDisabledResult();
  }

  const result = await contractService.activateDraft(auth, contractId, {
    ...data,
    paid_through_date: flags.contracts_opening_balance ? data.paid_through_date : null,
    opening_paid_amount: flags.contracts_opening_balance ? data.opening_paid_amount : null,
    opening_payment_date: flags.contracts_opening_balance ? data.opening_payment_date : null,
    opening_notes: flags.contracts_opening_balance ? data.opening_notes : null,
    historical_last_payment_amount: flags.contracts_opening_balance
      ? data.historical_last_payment_amount
      : null,
    historical_last_payment_reference: flags.contracts_opening_balance
      ? data.historical_last_payment_reference
      : null,
  }, ctx);
  if (result.success) revalidateContractViews(locale, contractId);
  return result;
}

export async function deleteContractDraft(locale: string, contractId: string) {
  if (!contractIdSchema.safeParse(contractId).success) {
    return { success: false as const, error: 'contractNotFound', errorCode: 'NOT_FOUND' as const };
  }
  const auth = await requirePermission(locale, 'contracts.update', await getCtx());
  const result = await contractService.deleteDraft(
    auth,
    contractId,
    { ...(await getCtx()), user_id: auth.userId, role: auth.role },
  );
  if (result.success) revalidateContractViews(locale, contractId);
  return result;
}
