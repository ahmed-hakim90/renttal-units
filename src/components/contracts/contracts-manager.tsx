'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarX, ChevronDown, FileText, Pencil, Plus } from 'lucide-react';
import { cancelContract, updateContract } from '@/lib/actions/contracts';
import { getContractPdfUrl } from '@/lib/actions/contract-attachments';
import { Button, buttonStyles } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ListSearch, useListSearchValue } from '@/components/ui/list-search';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/i18n/format';
import { getContractDisplayStatus } from '@/lib/rental/calculations';
import { getInvoiceDisplayStatus, hasOverdueInvoice } from '@/lib/rental/invoice-display';
import { matchesSearch } from '@/lib/search/matches-search';
import { Link } from '@/lib/i18n/navigation';
import { toast } from 'sonner';
import type {
  Contract,
  ContractCancellationHandling,
  PaymentCycle,
} from '@/types/database';
import type { Locale } from '@/lib/i18n/routing';

function formatContractDate(value: string | null | undefined, locale: Locale) {
  return value ? formatDate(value, locale) : '—';
}

function sortInvoices(contract: Contract) {
  return [...(contract.invoices ?? [])].sort((a, b) => a.due_date.localeCompare(b.due_date));
}

function contractUnitLabels(contract: Contract) {
  const rentalLines = (contract.lines ?? []).filter((line) => line.line_type === 'rental' && line.unit);
  if (rentalLines.length > 0) {
    return rentalLines.map((line) => line.unit?.unit_number).filter(Boolean).join(', ');
  }
  return contract.unit?.unit_number ?? '—';
}

function contractServiceAmount(contract: Contract) {
  return (contract.lines ?? [])
    .filter((line) => line.line_type === 'service')
    .reduce((sum, line) => sum + Number(line.amount), 0);
}

export function ContractsManager({
  contracts,
  locale,
  canEdit,
}: {
  contracts: Contract[];
  locale: string;
  canEdit: boolean;
}) {
  const t = useTranslations('contracts');
  const tc = useTranslations('common');
  const tFeature = useTranslations('featureFlags');
  const ts = useTranslations('common.status');
  const loc = locale as Locale;
  const search = useListSearchValue();
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [expandedInvoiceContracts, setExpandedInvoiceContracts] = useState<Set<string>>(
    () => new Set()
  );
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  const visibleContracts = useMemo(() => {
    return contracts.filter((contract) => matchesSearch(search, [
      contract.contract_number,
      contract.start_date,
      contract.end_date,
      contract.total_amount,
      contract.payment_cycle,
      tc(`paymentCycle.${contract.payment_cycle}`),
      contract.tax_mode,
      t(contract.tax_mode === 'taxable' ? 'taxable' : 'nonTaxable'),
      contract.status,
      t(getContractDisplayStatus(contract.status, contract.end_date)),
      hasOverdueInvoice(contract.invoices ?? []) ? ts('overdue') : null,
      contract.notes,
      contract.cancellation_date,
      contract.paid_through_date,
      contract.opening_paid_amount,
      contract.opening_payment_date,
      contract.opening_notes,
      contract.unit?.unit_number,
      ...(contract.lines ?? []).flatMap((line) => [
        line.line_type,
        line.unit?.unit_number,
        line.unit?.location?.name_en,
        line.unit?.location?.name_ar,
        line.unit?.location?.address,
        line.unit?.location?.city,
        line.unit?.location?.region,
        line.description,
        line.amount,
        line.period_start,
        line.period_end,
        line.odoo_line_id,
        line.odoo_product_id,
        line.odoo_product_name,
      ]),
      contract.unit?.location?.name_en,
      contract.unit?.location?.name_ar,
      contract.unit?.location?.address,
      contract.unit?.location?.city,
      contract.unit?.location?.region,
      contract.tenant?.full_name,
      contract.tenant?.phone,
      contract.tenant?.email,
      contract.tenant?.national_id,
      contract.tenant?.odoo_partner_id,
      contract.tenant?.vat,
      contract.tenant?.street,
      contract.tenant?.city,
      contract.tenant?.country_code,
      ...(contract.invoices ?? []).flatMap((invoice) => [
        invoice.invoice_number,
        invoice.period_start,
        invoice.period_end,
        invoice.amount,
        invoice.paid_amount,
        invoice.status,
        invoice.due_date,
        invoice.notes,
        invoice.odoo_invoice_id,
        invoice.odoo_invoice_name,
      ]),
      ...(contract.attachments ?? []).map((attachment) => attachment.original_filename),
    ]));
  }, [contracts, search, t, tc, ts]);

  function getActionErrorMessage(error: string) {
    if (error === 'featureDisabled') return tFeature('featureDisabled');
    if (error === 'activeContractExists') return t('activeContractExists');
    if (error === 'contractNotActive') return t('contractNotActive');
    if (error === 'cancellationDateOutOfRange') return t('cancellationDateOutOfRange');
    if (error === 'cancellationHasIssuedInvoices') return t('cancellationHasIssuedInvoices');
    if (error === 'cancellationRequiresSettlement') return t('cancellationRequiresSettlement');
    if (error === 'contractCancellationFailed') return t('contractCancellationFailed');
    if (error === 'duplicateContractNumber') return t('duplicateContractNumber');
    if (error === 'duplicateNationalId') return t('duplicateNationalId');
    if (error === 'contractHasFinancialActivity') return t('contractHasFinancialActivity');
    if (error === 'contractNotFound') return t('contractNotFound');
    return t('validationFailed');
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedContract || isSavingRef.current) return;

    const fd = new FormData(e.currentTarget);
    const existingLines = selectedContract.lines ?? [];
    const lines = existingLines.length > 0
      ? existingLines.map((line, index) => ({
          line_type: line.line_type,
          unit_id: line.unit_id,
          description: (fd.get(`line_description_${line.id}`) as string)?.trim() || line.description,
          amount: Number(fd.get(`line_amount_${line.id}`) ?? line.amount),
          period_start: selectedContract.start_date,
          period_end: selectedContract.end_date,
          odoo_line_id: line.odoo_line_id,
          odoo_product_id: line.odoo_product_id,
          odoo_product_name: line.odoo_product_name,
          tax_rate: Number(line.tax_rate),
          sort_order: index,
        }))
      : [{
          line_type: 'rental' as const,
          unit_id: selectedContract.unit_id,
          description: null,
          amount: Number(fd.get('total_amount')),
          period_start: fd.get('start_date') as string,
          period_end: fd.get('end_date') as string,
          sort_order: 0,
        }];

    const data = {
      contract_number: (fd.get('contract_number') as string).trim(),
      start_date: fd.get('start_date') as string,
      end_date: fd.get('end_date') as string,
      payment_cycle: fd.get('payment_cycle') as PaymentCycle,
      tax_mode: fd.get('apply_vat') === 'on' ? 'taxable' as const : 'non_taxable' as const,
      notes: (fd.get('notes') as string) || null,
      tenant_name: (fd.get('tenant_name') as string).trim(),
      tenant_phone: (fd.get('tenant_phone') as string) || null,
      tenant_email: (fd.get('tenant_email') as string) || null,
      tenant_national_id: (fd.get('tenant_national_id') as string) || null,
      lines,
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

  async function openAttachment(contractId: string, attachmentId: string) {
    const result = await getContractPdfUrl(locale, contractId, attachmentId);
    if (!result.success || !result.data) {
      toast.error(t('pdfDownloadFailed'));
      return;
    }
    window.open(result.data.url, '_blank', 'noopener,noreferrer');
  }

  function toggleContractInvoices(contractId: string) {
    setExpandedInvoiceContracts((current) => {
      const next = new Set(current);
      if (next.has(contractId)) next.delete(contractId);
      else next.add(contractId);
      return next;
    });
  }

  return (
    <>
      <div className="toolbar">
        <ListSearch />
        {canEdit && (
          <Link href="/contracts/new" className={buttonStyles({ className: 'w-full sm:w-auto' })}>
            <Plus />
            {t('create')}
          </Link>
        )}
      </div>

      {visibleContracts.length === 0 ? (
        <div className="surface-panel px-6 py-12 text-center text-muted-foreground">
          {search.trim() ? tc('noResults') : t('empty')}
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {visibleContracts.map((contract) => {
              const invoices = sortInvoices(contract);
              const hasOverdue = hasOverdueInvoice(invoices);
              return (
                <div key={contract.id} className="mobile-card">
                  <div>
                    <div className="min-w-0">
                      <Link
                        href={`/contracts/${contract.id}`}
                        className="block truncate font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        {contract.contract_number
                          ? `${contract.contract_number} — ${contractUnitLabels(contract)}`
                          : contractUnitLabels(contract)}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {formatContractDate(contract.start_date, loc)} - {formatContractDate(contract.end_date, loc)}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge
                        status={getContractDisplayStatus(contract.status, contract.end_date)}
                        label={t(getContractDisplayStatus(contract.status, contract.end_date))}
                      />
                      {hasOverdue && <Badge status="overdue" label={ts('overdue')} />}
                    </div>
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
                      <p className="text-xs text-muted-foreground">{t('taxMode')}</p>
                      <p>{t(contract.tax_mode === 'taxable' ? 'taxable' : 'nonTaxable')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('invoices')}</p>
                      <p>{t('invoiceCount', { count: invoices.length })}</p>
                    </div>
                  </div>
                  {canEdit && contract.status === 'draft' && (
                    <div className="mt-4">
                      <Link
                        href={`/contracts/${contract.id}/edit`}
                        className={buttonStyles({ variant: 'outline', size: 'sm', className: 'w-full' })}
                      >
                        <Pencil />
                        {t('continueDraft')}
                      </Link>
                    </div>
                  )}
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
                        <Pencil />
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
                        <CalendarX />
                        {t('cancel')}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>{t('contractNumber')}</th>
                  <th>{t('unit')}</th>
                  <th>{t('tenant')}</th>
                  <th>{t('period')}</th>
                  <th>{t('totalAmount')}</th>
                  <th>{t('paymentCycle')}</th>
                  <th>{t('taxMode')}</th>
                  <th>{t('invoices')}</th>
                  <th>{t('status')}</th>
                  {canEdit && <th className="!text-end">{tc('actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {visibleContracts.map((contract) => {
                  const invoices = sortInvoices(contract);
                  const hasOverdue = hasOverdueInvoice(invoices);
                  const invoicesExpanded = expandedInvoiceContracts.has(contract.id);
                  const invoiceDetailsId = `contract-invoices-${contract.id}`;
                  return (
                    <Fragment key={contract.id}>
                      <tr className="align-top">
                        <td className="font-medium">
                          <Link
                            href={`/contracts/${contract.id}`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {contract.contract_number ?? '—'}
                          </Link>
                        </td>
                        <td className="font-medium">
                          <div>{contractUnitLabels(contract)}</div>
                          {contractServiceAmount(contract) > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {t('serviceFees')}: {formatCurrency(contractServiceAmount(contract), loc)}
                            </div>
                          )}
                        </td>
                        <td className="text-muted-foreground">{contract.tenant?.full_name ?? '—'}</td>
                        <td className="text-xs">
                          {formatContractDate(contract.start_date, loc)} - {formatContractDate(contract.end_date, loc)}
                        </td>
                        <td>{formatCurrency(Number(contract.total_amount), loc)}</td>
                        <td>{tc(`paymentCycle.${contract.payment_cycle}`)}</td>
                        <td>{t(contract.tax_mode === 'taxable' ? 'taxable' : 'nonTaxable')}</td>
                        <td>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-medium text-primary disabled:cursor-default disabled:opacity-60"
                            aria-expanded={invoicesExpanded}
                            aria-controls={invoiceDetailsId}
                            disabled={invoices.length === 0}
                            onClick={() => toggleContractInvoices(contract.id)}
                          >
                            <ChevronDown
                              className={`size-4 transition-transform ${invoicesExpanded ? 'rotate-180' : ''}`}
                              aria-hidden="true"
                            />
                            {t('invoiceCount', { count: invoices.length })}
                          </button>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge
                              status={getContractDisplayStatus(contract.status, contract.end_date)}
                              label={t(getContractDisplayStatus(contract.status, contract.end_date))}
                            />
                            {hasOverdue && <Badge status="overdue" label={ts('overdue')} />}
                          </div>
                        </td>
                        {canEdit && (
                          <td className="text-end">
                            {contract.status === 'draft' && (
                              <div className="row-actions">
                                <Link
                                  href={`/contracts/${contract.id}/edit`}
                                  className={buttonStyles({ variant: 'ghost', size: 'icon-sm' })}
                                  title={t('continueDraft')}
                                  aria-label={t('continueDraft')}
                                >
                                  <Pencil />
                                </Link>
                              </div>
                            )}
                            {contract.status === 'active' && (
                              <div className="row-actions">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  title={t('edit')}
                                  aria-label={t('edit')}
                                  onClick={() => {
                                    setSelectedContract(contract);
                                    setEditOpen(true);
                                  }}
                                >
                                  <Pencil />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  title={t('cancel')}
                                  aria-label={t('cancel')}
                                  onClick={() => {
                                    setSelectedContract(contract);
                                    setCancelOpen(true);
                                  }}
                                >
                                  <CalendarX />
                                </Button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                      {invoicesExpanded && (
                        <tr id={invoiceDetailsId} className="bg-muted/20 hover:!bg-muted/20">
                          <td colSpan={canEdit ? 10 : 9} className="!p-4">
                            <div className="overflow-hidden rounded-xl border border-border bg-card">
                              <table className="w-full text-sm">
                                <thead className="border-b border-border bg-muted/60">
                                  <tr>
                                    <th className="px-4 py-2.5 text-start text-xs font-semibold text-foreground/70">
                                      {t('dueDate')}
                                    </th>
                                    <th className="px-4 py-2.5 text-start text-xs font-semibold text-foreground/70">
                                      {t('amount')}
                                    </th>
                                    <th className="px-4 py-2.5 text-start text-xs font-semibold text-foreground/70">
                                      {t('paidAmount')}
                                    </th>
                                    <th className="px-4 py-2.5 text-start text-xs font-semibold text-foreground/70">
                                      {t('status')}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {invoices.map((invoice) => (
                                    <tr key={invoice.id} className="border-t border-border first:border-t-0">
                                      <td className="px-4 py-2.5">{formatDate(invoice.due_date, loc)}</td>
                                      <td className="px-4 py-2.5">
                                        {formatCurrency(Number(invoice.amount), loc)}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        {formatCurrency(Number(invoice.paid_amount), loc)}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <Badge
                                          status={getInvoiceDisplayStatus(invoice)}
                                          label={ts(getInvoiceDisplayStatus(invoice))}
                                        />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

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
              <p className="mt-1.5 flex min-h-10 items-center rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
                {contractUnitLabels(selectedContract)}
                {selectedContract.unit?.location?.name_en ? ` — ${selectedContract.unit.location.name_en}` : ''}
              </p>
            </div>
            {(selectedContract.lines ?? []).length > 0 && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <p className="text-sm font-medium text-muted-foreground">{t('linesSection')}</p>
                {(selectedContract.lines ?? []).map((line) => (
                  <div key={line.id} className="grid gap-3 md:grid-cols-2 rounded-lg border border-border p-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {line.line_type === 'service' ? t('serviceLine') : t('rentalLine')}
                      </p>
                      <p className="text-sm font-medium">
                        {line.line_type === 'rental'
                          ? (line.unit?.unit_number ?? '—')
                          : (line.description || t('serviceLine'))}
                      </p>
                    </div>
                    <Input
                      name={`line_amount_${line.id}`}
                      label={t('lineAmount')}
                      type="number"
                      step="0.01"
                      required
                      defaultValue={Number(line.amount)}
                    />
                    <input type="hidden" name={`line_description_${line.id}`} defaultValue={line.description ?? ''} />
                  </div>
                ))}
              </div>
            )}
            {(selectedContract.attachments ?? []).length > 0 && (
              <div className="space-y-2 rounded-xl border border-border p-4">
                <p className="text-sm font-medium text-muted-foreground">{t('contractDocuments')}</p>
                {selectedContract.attachments?.map((attachment) => (
                  <Button
                    key={attachment.id}
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => void openAttachment(selectedContract.id, attachment.id)}
                  >
                    <FileText />
                    {attachment.original_filename}
                  </Button>
                ))}
              </div>
            )}
            <Input
              name="start_date"
              label={t('startDate')}
              type="date"
              required
              defaultValue={selectedContract.start_date ?? ''}
            />
            <Input
              name="end_date"
              label={t('endDate')}
              type="date"
              required
              defaultValue={selectedContract.end_date ?? ''}
            />
            {(selectedContract.lines ?? []).length === 0 && (
              <Input
                name="total_amount"
                label={t('totalAmount')}
                type="number"
                step="0.01"
                required
                defaultValue={Number(selectedContract.total_amount)}
              />
            )}
            <div>
              <label className="text-sm font-medium">{t('paymentCycle')}</label>
              <select
                name="payment_cycle"
                defaultValue={selectedContract.payment_cycle}
                className="mt-1.5 flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
              >
                {(['quarterly', 'semi_annual', 'yearly'] as const).map((cycle) => (
                  <option key={cycle} value={cycle}>{tc(`paymentCycle.${cycle}`)}</option>
                ))}
              </select>
            </div>
            <Input
              name="notes"
              label={t('notes')}
              defaultValue={selectedContract.notes ?? ''}
            />
            <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm">
              <input
                name="apply_vat"
                type="checkbox"
                defaultChecked={selectedContract.tax_mode !== 'non_taxable'}
                className="h-4 w-4"
              />
              {t('applyVat')}
            </label>
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
            <div className="form-actions">
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
            <div className="form-actions">
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
