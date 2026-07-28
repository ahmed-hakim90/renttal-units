'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { CalendarX, Pencil, Plus } from 'lucide-react';
import { cancelContract, updateContract } from '@/lib/actions/contracts';
import { ContractCreateForm } from '@/components/contracts/contract-create-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/i18n/format';
import { getContractDisplayStatus } from '@/lib/rental/calculations';
import { getInvoiceDisplayStatus } from '@/lib/rental/invoice-display';
import { toast } from 'sonner';
import type {
  Contract,
  ContractCancellationHandling,
  PaymentCycle,
  Unit,
} from '@/types/database';
import type { Locale } from '@/lib/i18n/routing';

function sortInvoices(contract: Contract) {
  return [...(contract.invoices ?? [])].sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export function ContractsManager({
  contracts,
  units,
  locale,
  canEdit,
}: {
  contracts: Contract[];
  units: Unit[];
  locale: string;
  canEdit: boolean;
}) {
  const t = useTranslations('contracts');
  const tc = useTranslations('common');
  const ts = useTranslations('common.status');
  const loc = locale as Locale;
  const searchParams = useSearchParams();
  const search = searchParams.get('search')?.trim().toLowerCase() ?? '';
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  const availableUnits = useMemo(
    () => units.filter((unit) => !unit.active_contract),
    [units]
  );

  const visibleContracts = useMemo(() => {
    if (!search) return contracts;
    return contracts.filter((contract) => [
      contract.contract_number,
      contract.unit?.unit_number,
      contract.unit?.location?.name_en,
      contract.unit?.location?.name_ar,
      contract.tenant?.full_name,
      contract.status,
    ].join(' ').toLowerCase().includes(search));
  }, [contracts, search]);

  function getActionErrorMessage(error: string) {
    if (error === 'activeContractExists') return t('activeContractExists');
    if (error === 'contractNotActive') return t('contractNotActive');
    if (error === 'cancellationDateOutOfRange') return t('cancellationDateOutOfRange');
    if (error === 'duplicateContractNumber') return t('duplicateContractNumber');
    if (error === 'duplicateNationalId') return t('duplicateNationalId');
    if (error === 'contractHasFinancialActivity') return t('contractHasFinancialActivity');
    return error;
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedContract || isSavingRef.current) return;

    const fd = new FormData(e.currentTarget);
    const data = {
      contract_number: (fd.get('contract_number') as string).trim(),
      start_date: fd.get('start_date') as string,
      end_date: fd.get('end_date') as string,
      total_amount: Number(fd.get('total_amount')),
      payment_cycle: fd.get('payment_cycle') as PaymentCycle,
      notes: (fd.get('notes') as string) || null,
      tenant_name: (fd.get('tenant_name') as string).trim(),
      tenant_phone: (fd.get('tenant_phone') as string) || null,
      tenant_email: (fd.get('tenant_email') as string) || null,
      tenant_national_id: (fd.get('tenant_national_id') as string) || null,
    };

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const result = await updateContract(locale, selectedContract.id, data);
      if (result.success) {
        toast.success(tc('success'));
        setEditOpen(false);
        setSelectedContract(null);
      } else {
        toast.error(result.error ? getActionErrorMessage(result.error) : tc('error'));
      }
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleCancel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedContract || isSavingRef.current) return;

    const fd = new FormData(e.currentTarget);
    const data = {
      cancellation_date: fd.get('cancellation_date') as string,
      cancellation_handling: fd.get('cancellation_handling') as ContractCancellationHandling,
    };

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const result = await cancelContract(locale, selectedContract.id, data);
      if (result.success) {
        toast.success(tc('success'));
        setCancelOpen(false);
        setSelectedContract(null);
      } else {
        toast.error(result.error ? getActionErrorMessage(result.error) : tc('error'));
      }
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <>
      {canEdit && (
        <Button className="mb-4 w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('create')}
        </Button>
      )}

      {visibleContracts.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {visibleContracts.map((contract) => {
              const invoices = sortInvoices(contract);
              return (
                <div key={contract.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {contract.contract_number
                          ? `${contract.contract_number} — ${contract.unit?.unit_number ?? '—'}`
                          : (contract.unit?.unit_number ?? '—')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(contract.start_date, loc)} - {formatDate(contract.end_date, loc)}
                      </p>
                    </div>
                    <Badge
                      status={getContractDisplayStatus(contract.status, contract.end_date)}
                      label={t(getContractDisplayStatus(contract.status, contract.end_date))}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('tenant')}</p>
                      <p>{contract.tenant?.full_name ?? t('noTenant')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('totalAmount')}</p>
                      <p>{formatCurrency(Number(contract.total_amount), loc)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('paymentCycle')}</p>
                      <p>{tc(`paymentCycle.${contract.payment_cycle}`)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('invoices')}</p>
                      <p>{t('invoiceCount', { count: invoices.length })}</p>
                    </div>
                  </div>
                  {canEdit && contract.status === 'active' && (
                    <div className="mt-4 flex gap-2">
                      <Button
                        className="flex-1"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedContract(contract);
                          setEditOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        {t('edit')}
                      </Button>
                      <Button
                        className="flex-1"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedContract(contract);
                          setCancelOpen(true);
                        }}
                      >
                        <CalendarX className="h-4 w-4" />
                        {t('cancel')}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden rounded-2xl border border-border overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-start">{t('contractNumber')}</th>
                  <th className="px-4 py-3 text-start">{t('unit')}</th>
                  <th className="px-4 py-3 text-start">{t('tenant')}</th>
                  <th className="px-4 py-3 text-start">{t('period')}</th>
                  <th className="px-4 py-3 text-start">{t('totalAmount')}</th>
                  <th className="px-4 py-3 text-start">{t('paymentCycle')}</th>
                  <th className="px-4 py-3 text-start">{t('invoices')}</th>
                  <th className="px-4 py-3 text-start">{t('status')}</th>
                  {canEdit && <th className="px-4 py-3 text-end">{tc('actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {visibleContracts.map((contract) => {
                  const invoices = sortInvoices(contract);
                  return (
                    <tr key={contract.id} className="border-t border-border align-top">
                      <td className="px-4 py-3 font-medium">{contract.contract_number ?? '—'}</td>
                      <td className="px-4 py-3 font-medium">{contract.unit?.unit_number ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{contract.tenant?.full_name ?? '—'}</td>
                      <td className="px-4 py-3 text-xs">
                        {formatDate(contract.start_date, loc)} - {formatDate(contract.end_date, loc)}
                      </td>
                      <td className="px-4 py-3">{formatCurrency(Number(contract.total_amount), loc)}</td>
                      <td className="px-4 py-3">{tc(`paymentCycle.${contract.payment_cycle}`)}</td>
                      <td className="px-4 py-3">
                        <details>
                          <summary className="cursor-pointer text-primary">{t('invoiceCount', { count: invoices.length })}</summary>
                          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {invoices.map((invoice) => (
                              <div key={invoice.id} className="flex justify-between gap-4">
                                <span>{formatDate(invoice.due_date, loc)}</span>
                                <span>{formatCurrency(Number(invoice.amount), loc)}</span>
                                <span>{ts(getInvoiceDisplayStatus(invoice))}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                      status={getContractDisplayStatus(contract.status, contract.end_date)}
                      label={t(getContractDisplayStatus(contract.status, contract.end_date))}
                    />
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-end">
                          {contract.status === 'active' && (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedContract(contract);
                                  setEditOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                                {t('edit')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedContract(contract);
                                  setCancelOpen(true);
                                }}
                              >
                                <CalendarX className="h-4 w-4" />
                                {t('cancel')}
                              </Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal open={createOpen} onClose={() => !isSaving && setCreateOpen(false)} title={t('create')}>
        {createOpen && (
          <ContractCreateForm
            key="create-contract-form"
            units={availableUnits}
            locale={locale}
            isSaving={isSaving}
            setIsSaving={(saving) => {
              isSavingRef.current = saving;
              setIsSaving(saving);
            }}
            onCancel={() => setCreateOpen(false)}
            onSuccess={() => setCreateOpen(false)}
          />
        )}
      </Modal>

      <Modal open={editOpen} onClose={() => !isSaving && setEditOpen(false)} title={t('edit')}>
        {selectedContract && (
          <form key={selectedContract.id} onSubmit={handleEdit} className="space-y-4">
            <Input
              name="contract_number"
              label={t('contractNumber')}
              defaultValue={selectedContract.contract_number ?? ''}
              required
            />
            <div>
              <label className="text-sm font-medium">{t('unit')}</label>
              <p className="mt-1.5 flex h-10 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm">
                {selectedContract.unit?.unit_number ?? '—'}
                {selectedContract.unit?.location?.name_en ? ` — ${selectedContract.unit.location.name_en}` : ''}
              </p>
            </div>
            <Input
              name="start_date"
              label={t('startDate')}
              type="date"
              required
              defaultValue={selectedContract.start_date}
            />
            <Input
              name="end_date"
              label={t('endDate')}
              type="date"
              required
              defaultValue={selectedContract.end_date}
            />
            <Input
              name="total_amount"
              label={t('totalAmount')}
              type="number"
              step="0.01"
              required
              defaultValue={Number(selectedContract.total_amount)}
            />
            <div>
              <label className="text-sm font-medium">{t('paymentCycle')}</label>
              <select
                name="payment_cycle"
                defaultValue={selectedContract.payment_cycle}
                className="mt-1.5 flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
              >
                {(['monthly', 'quarterly', 'semi_annual', 'yearly'] as const).map((cycle) => (
                  <option key={cycle} value={cycle}>{tc(`paymentCycle.${cycle}`)}</option>
                ))}
              </select>
            </div>
            <Input
              name="notes"
              label={t('notes')}
              defaultValue={selectedContract.notes ?? ''}
            />
            <div className="rounded-xl border border-border p-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">{t('tenantSection')}</p>
              <Input
                name="tenant_name"
                label={t('tenantName')}
                defaultValue={selectedContract.tenant?.full_name ?? ''}
                required
              />
              <Input
                name="tenant_phone"
                label={t('tenantPhone')}
                type="tel"
                defaultValue={selectedContract.tenant?.phone ?? ''}
              />
              <Input
                name="tenant_email"
                label={t('tenantEmail')}
                type="email"
                defaultValue={selectedContract.tenant?.email ?? ''}
              />
              <Input
                name="tenant_national_id"
                label={t('tenantNationalId')}
                defaultValue={selectedContract.tenant?.national_id ?? ''}
                inputMode="numeric"
                maxLength={10}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" type="button" disabled={isSaving} onClick={() => setEditOpen(false)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? tc('loading') : tc('save')}</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={cancelOpen} onClose={() => !isSaving && setCancelOpen(false)} title={t('cancel')}>
        {selectedContract && (
          <form onSubmit={handleCancel} className="space-y-4">
            <Input
              name="cancellation_date"
              label={t('cancellationDate')}
              type="date"
              required
              defaultValue={new Date().toISOString().split('T')[0]}
            />
            <div>
              <label className="text-sm font-medium">{t('cancellationHandling')}</label>
              <select name="cancellation_handling" defaultValue="keep_current_full" className="mt-1.5 flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm">
                <option value="keep_current_full">{t('keepCurrentFull')}</option>
                <option value="prorate_current">{t('prorateCurrent')}</option>
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" type="button" disabled={isSaving} onClick={() => setCancelOpen(false)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? tc('loading') : t('cancel')}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
