import type { Contract, Invoice } from '@/types/database';

export type ContractEditMode = 'edit-draft' | 'edit-active';

export type ContractEditAccess =
  | { allowed: true; mode: ContractEditMode }
  | { allowed: false; reason: 'cancelled' | 'completed' | 'unknown' };

/** Only draft and active contracts may open the full-page editor. */
export function getContractEditAccess(status: Contract['status']): ContractEditAccess {
  if (status === 'draft') return { allowed: true, mode: 'edit-draft' };
  if (status === 'active') return { allowed: true, mode: 'edit-active' };
  if (status === 'cancelled') return { allowed: false, reason: 'cancelled' };
  if (status === 'completed') return { allowed: false, reason: 'completed' };
  return { allowed: false, reason: 'unknown' };
}

/** Mirrors contractService.hasFinancialActivity — issued/paid invoices lock schedule edits. */
export function contractHasFinancialActivity(
  invoices: Pick<Invoice, 'paid_amount' | 'status'>[] | null | undefined,
): boolean {
  return (invoices ?? []).some(
    (invoice) => Number(invoice.paid_amount) > 0 || invoice.status !== 'due',
  );
}
