'use server';

import { revalidatePath } from 'next/cache';
import type { ContractCancellationHandling, PaymentCycle } from '@/types/database';
import { requireAuth, requireAdminEditor } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { contractService } from '@/lib/services/contract-service';

async function getCtx() {
  return { correlation_id: await getCorrelationId() };
}

function revalidateContractViews(locale: string) {
  revalidatePath(`/${locale}/contracts`);
  revalidatePath(`/${locale}/units`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/due-this-month`);
  revalidatePath(`/${locale}/invoices`);
  revalidatePath(`/${locale}/reports/debt-aging`);
}

export async function getContracts(locale: string) {
  const auth = await requireAuth(locale, await getCtx());
  return contractService.list(auth, { ...(await getCtx()), user_id: auth.userId, role: auth.role });
}

export async function createContract(locale: string, data: {
  unit_id: string;
  contract_number: string;
  start_date: string;
  end_date: string;
  total_amount: number;
  payment_cycle: PaymentCycle;
  notes?: string | null;
  tenant_name: string;
  tenant_phone?: string | null;
  tenant_email?: string | null;
  tenant_national_id?: string | null;
  paid_through_date?: string | null;
  opening_paid_amount?: number | null;
}) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const result = await contractService.create(auth, data, { ...(await getCtx()), user_id: auth.userId, role: auth.role });
  if (result.success) revalidateContractViews(locale);
  return result;
}

export async function updateContract(locale: string, id: string, data: {
  contract_number: string;
  start_date: string;
  end_date: string;
  total_amount: number;
  payment_cycle: PaymentCycle;
  notes?: string | null;
  tenant_name: string;
  tenant_phone?: string | null;
  tenant_email?: string | null;
  tenant_national_id?: string | null;
}) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const result = await contractService.update(auth, id, data, { ...(await getCtx()), user_id: auth.userId, role: auth.role });
  if (result.success) revalidateContractViews(locale);
  return result;
}

export async function cancelContract(locale: string, id: string, data: {
  cancellation_date: string;
  cancellation_handling: ContractCancellationHandling;
}) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const result = await contractService.cancel(auth, id, data, { ...(await getCtx()), user_id: auth.userId, role: auth.role });
  if (result.success) revalidateContractViews(locale);
  return result;
}
