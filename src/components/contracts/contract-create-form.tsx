'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { createContract } from '@/lib/actions/contracts';
import { uploadContractPdf } from '@/lib/actions/contract-attachments';
import { searchOdooPartners, searchOdooProducts } from '@/lib/actions/odoo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate } from '@/lib/i18n/format';
import {
  previewContractInvoices,
  sumContractLineAmounts,
  validateContractForm,
  type ContractFormErrorCode,
  type ContractFormField,
  type ContractFormLineValues,
  type ContractFormValues,
} from '@/lib/rental/contract-form-validation';
import { cn } from '@/lib/utils';
import type { ContractLineType, PaymentCycle, Unit } from '@/types/database';
import type { Locale } from '@/lib/i18n/routing';

type OdooPartnerResult = {
  id: number;
  name?: unknown;
  display_name?: unknown;
  phone?: unknown;
  email?: unknown;
  vat?: unknown;
  street?: unknown;
  city?: unknown;
  country_id?: unknown;
  country_code?: unknown;
};

type OdooServiceProduct = {
  id: number;
  name: string;
  default_code: string | null;
  display_name: string;
};

function newLine(lineType: ContractLineType = 'rental'): ContractFormLineValues {
  return {
    key: `${lineType}-${Math.random().toString(36).slice(2, 10)}`,
    line_type: lineType,
    unit_id: '',
    description: '',
    amount: '',
    amount_basis: 'annual_untaxed',
    annual_amount_untaxed: '',
    odoo_product_id: '',
    odoo_product_name: '',
    tax_rate: '15',
    tax_treatment: 'standard',
  };
}

const EMPTY_FORM: ContractFormValues = {
  unit_id: '',
  contract_number: '',
  start_date: '',
  end_date: '',
  total_amount: '',
  payment_cycle: 'quarterly',
  paid_through_date: '',
  opening_paid_amount: '',
  last_payment_date: '',
  opening_notes: '',
  tenant_name: '',
  tenant_email: '',
  tenant_national_id: '',
  lines: [newLine('rental')],
  payment_conditions: [{
    enabled: false,
    applies_after_years: '5',
    percentage: '10',
  }],
};

function SelectField({
  label,
  name,
  value,
  onChange,
  onBlur,
  error,
  children,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={cn(
          'mt-0 flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm',
          error && 'border-destructive',
        )}
      >
        {children}
      </select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function ContractCreateForm({
  units,
  locale,
  onSuccess,
  onCancel,
  isSaving,
  setIsSaving,
  openingBalanceEnabled,
  multiLineEnabled = true,
}: {
  units: Unit[];
  locale: string;
  onSuccess: () => void;
  onCancel: () => void;
  isSaving: boolean;
  setIsSaving: (saving: boolean) => void;
  openingBalanceEnabled: boolean;
  multiLineEnabled?: boolean;
}) {
  const t = useTranslations('contracts');
  const tc = useTranslations('common');
  const tFeature = useTranslations('featureFlags');
  const loc = locale as Locale;

  const [values, setValues] = useState<ContractFormValues>(EMPTY_FORM);
  const [taxSelection, setTaxSelection] = useState<'taxable' | 'zero_rated'>('taxable');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantOdooPartnerId, setTenantOdooPartnerId] = useState<number | null>(null);
  const [tenantVat, setTenantVat] = useState('');
  const [tenantStreet, setTenantStreet] = useState('');
  const [tenantCity, setTenantCity] = useState('');
  const [tenantCountryCode, setTenantCountryCode] = useState('SA');
  const [syncTenantToOdoo, setSyncTenantToOdoo] = useState(true);
  const [partnerQuery, setPartnerQuery] = useState('');
  const [partnerResults, setPartnerResults] = useState<OdooPartnerResult[]>([]);
  const [serviceProducts, setServiceProducts] = useState<OdooServiceProduct[]>([]);
  const [serviceProductsLoaded, setServiceProductsLoaded] = useState(false);
  const [isSearchingPartners, setIsSearchingPartners] = useState(false);
  const partnerSearchSeq = useRef(0);
  const [notes, setNotes] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [createdContractId, setCreatedContractId] = useState<string | null>(null);
  const [touched, setTouched] = useState<Partial<Record<ContractFormField, boolean>>>({});
  const [attempted, setAttempted] = useState(false);

  const lineTotal = sumContractLineAmounts(values.lines);
  const formValues = useMemo(() => ({
    ...values,
    total_amount: String(lineTotal || ''),
    unit_id: values.lines.find((line) => line.line_type === 'rental' && line.unit_id)?.unit_id ?? '',
  }), [lineTotal, values]);

  const errors = validateContractForm(formValues, { requireUnit: true });
  const preview = previewContractInvoices(formValues);
  const hasErrors = Object.keys(errors).length > 0;

  const selectedUnitIds = useMemo(
    () => new Set(values.lines.filter((line) => line.line_type === 'rental' && line.unit_id).map((line) => line.unit_id)),
    [values.lines],
  );

  function fieldError(field: ContractFormField): string | undefined {
    if (!(attempted || touched[field])) return undefined;
    const code = errors[field];
    return code ? t(`validation.${code}` as `validation.${ContractFormErrorCode}`) : undefined;
  }

  function setField<K extends keyof ContractFormValues>(key: K, value: ContractFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function touch(field: ContractFormField) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function updateLine(key: string, patch: Partial<ContractFormLineValues>) {
    setValues((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    }));
    touch('lines');
  }

  function addLine(lineType: ContractLineType) {
    setValues((prev) => ({
      ...prev,
      lines: [...prev.lines, {
        ...newLine(lineType),
        tax_rate: taxSelection === 'taxable' ? '15' : '0',
        tax_treatment: taxSelection === 'zero_rated' ? 'zero_rated' : 'standard',
      }],
    }));
    touch('lines');
    if (lineType === 'service' && !serviceProductsLoaded) {
      setServiceProductsLoaded(true);
      void searchOdooProducts(locale, '', 500, 'service')
        .then((products) => setServiceProducts(products as OdooServiceProduct[]))
        .catch(() => {
          setServiceProducts([]);
          toast.error(t('serviceProductsLoadFailed'));
        });
    }
  }

  function removeLine(key: string) {
    setValues((prev) => ({
      ...prev,
      lines: prev.lines.length <= 1 ? prev.lines : prev.lines.filter((line) => line.key !== key),
    }));
    touch('lines');
  }

  function getActionErrorMessage(error: string) {
    if (error === 'featureDisabled') return tFeature('featureDisabled');
    if (error === 'activeContractExists') return t('activeContractExists');
    if (error === 'duplicateContractNumber') return t('duplicateContractNumber');
    if (error === 'duplicateNationalId') return t('duplicateNationalId');
    if (error === 'unitNotFound') return t('unitNotFound');
    if (error === 'serviceProductInvalid') return t('serviceProductInvalid');
    if (error === 'contractCreateFailed') return t('contractCreateFailed');
    return t('validationFailed');
  }

  function getString(value: unknown) {
    return typeof value === 'string' ? value : '';
  }

  function getPartnerName(partner: OdooPartnerResult) {
    return getString(partner.display_name) || getString(partner.name) || `#${partner.id}`;
  }

  useEffect(() => {
    const term = partnerQuery.trim();
    const searchId = ++partnerSearchSeq.current;

    if (tenantOdooPartnerId || term.length < 2) return;

    const timeout = window.setTimeout(() => {
      void searchOdooPartners(locale, term)
        .then((results) => {
          if (partnerSearchSeq.current === searchId) {
            setPartnerResults(results as OdooPartnerResult[]);
          }
        })
        .catch((error) => {
          if (partnerSearchSeq.current === searchId) {
            setPartnerResults([]);
            toast.error(error instanceof Error ? error.message : tc('error'));
          }
        })
        .finally(() => {
          if (partnerSearchSeq.current === searchId) {
            setIsSearchingPartners(false);
          }
        });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [locale, partnerQuery, tc, tenantOdooPartnerId]);

  function selectPartner(partner: OdooPartnerResult) {
    setTenantOdooPartnerId(partner.id);
    setSyncTenantToOdoo(false);
    setField('tenant_name', getPartnerName(partner));
    setTenantPhone(getString(partner.phone));
    setField('tenant_email', getString(partner.email));
    setTenantVat(getString(partner.vat));
    setTenantStreet(getString(partner.street));
    setTenantCity(getString(partner.city));
    setTenantCountryCode(getString(partner.country_code) || tenantCountryCode);
    setPartnerResults([]);
    setPartnerQuery(getPartnerName(partner));
  }

  function clearSelectedPartner() {
    setTenantOdooPartnerId(null);
    setSyncTenantToOdoo(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAttempted(true);
    if (hasErrors || isSaving) return;

    setIsSaving(true);
    try {
      if (createdContractId && pdfFile) {
        const uploadData = new FormData();
        uploadData.set('file', pdfFile);
        const uploadResult = await uploadContractPdf(locale, createdContractId, uploadData);
        if (!uploadResult.success) {
          toast.error(t('pdfUploadFailed'));
          return;
        }
        toast.success(tc('success'));
        onSuccess();
        return;
      }

      const result = await createContract(locale, {
        contract_number: values.contract_number.trim(),
        start_date: values.start_date,
        end_date: values.end_date,
        payment_cycle: values.payment_cycle,
        tax_mode: taxSelection === 'taxable' ? 'taxable' : 'non_taxable',
        notes: notes.trim() || null,
        paid_through_date: openingBalanceEnabled ? values.paid_through_date.trim() || null : null,
        opening_paid_amount: openingBalanceEnabled && values.opening_paid_amount.trim()
          ? Number(values.opening_paid_amount)
          : null,
        opening_payment_date: openingBalanceEnabled ? values.last_payment_date.trim() || null : null,
        opening_notes: openingBalanceEnabled ? values.opening_notes.trim() || null : null,
        tenant_name: values.tenant_name.trim(),
        tenant_phone: tenantPhone.trim() || null,
        tenant_email: values.tenant_email.trim() || null,
        tenant_national_id: values.tenant_national_id.trim() || null,
        tenant_odoo_partner_id: tenantOdooPartnerId,
        tenant_vat: tenantVat.trim() || null,
        tenant_street: tenantStreet.trim() || null,
        tenant_city: tenantCity.trim() || null,
        tenant_country_code: tenantCountryCode.trim() || null,
        sync_tenant_to_odoo: syncTenantToOdoo,
        lines: values.lines.map((line, index) => ({
          line_type: line.line_type,
          unit_id: line.line_type === 'rental' ? line.unit_id : null,
          description: line.description.trim() || null,
          amount: 0,
          amount_basis: 'annual_untaxed' as const,
          annual_amount_untaxed: Number(line.annual_amount_untaxed) || null,
          odoo_product_id: line.line_type === 'rental'
            ? units.find((unit) => unit.id === line.unit_id)?.odoo_product_id ?? null
            : line.odoo_product_id ? Number(line.odoo_product_id) : null,
          odoo_product_name: line.line_type === 'rental'
            ? units.find((unit) => unit.id === line.unit_id)?.odoo_product_reference ?? null
            : line.odoo_product_name || null,
          tax_rate: Number(line.tax_rate),
          tax_treatment: line.tax_treatment === 'zero_rated' ? 'zero_rated' : 'standard',
          period_start: values.start_date,
          period_end: values.end_date,
          sort_order: index,
        })),
      });

      if (result.success) {
        if (pdfFile && result.data) {
          const uploadData = new FormData();
          uploadData.set('file', pdfFile);
          const uploadResult = await uploadContractPdf(locale, result.data.id, uploadData);
          if (!uploadResult.success) {
            setCreatedContractId(result.data.id);
            toast.error(t('contractSavedPdfRetry'));
            return;
          }
        }
        toast.success(tc('success'));
        onSuccess();
      } else {
        toast.error(result.error ? getActionErrorMessage(result.error) : tc('error'));
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Input
        name="contract_number"
        label={t('contractNumber')}
        value={values.contract_number}
        onChange={(e) => setField('contract_number', e.target.value)}
        onBlur={() => touch('contract_number')}
        error={fieldError('contract_number')}
        required
      />

      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{t('linesSection')}</p>
          <div className="flex flex-wrap gap-2">
            {multiLineEnabled && (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => addLine('rental')}>
                  <Plus />
                  {t('addRentalLine')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => addLine('service')}>
                  <Plus />
                  {t('addServiceLine')}
                </Button>
              </>
            )}
          </div>
        </div>
        {fieldError('lines') && <p className="text-xs text-destructive">{fieldError('lines')}</p>}
        {fieldError('unit_id') && <p className="text-xs text-destructive">{fieldError('unit_id')}</p>}

        <div className="space-y-3">
          {values.lines.map((line, index) => {
            const availableUnits = units.filter((unit) => (
              !selectedUnitIds.has(unit.id) || unit.id === line.unit_id
            ));
            return (
              <div key={line.key} className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {line.line_type === 'service' ? t('serviceLine') : t('rentalLine')} #{index + 1}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeLine(line.key)}
                    disabled={values.lines.length <= 1}
                    aria-label={t('removeLine')}
                    title={t('removeLine')}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {line.line_type === 'rental' ? (
                    <SelectField
                      label={t('unit')}
                      name={`unit-${line.key}`}
                      value={line.unit_id}
                      onChange={(value) => updateLine(line.key, { unit_id: value })}
                    >
                      <option value="">{t('selectUnit')}</option>
                      {availableUnits.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.unit_number} - {unit.location?.name_en ?? ''}
                        </option>
                      ))}
                    </SelectField>
                  ) : (
                    <SelectField
                      label={t('serviceProduct')}
                      name={`service-product-${line.key}`}
                      value={line.odoo_product_id}
                      onChange={(value) => {
                        const product = serviceProducts.find((item) => String(item.id) === value);
                        updateLine(line.key, {
                          odoo_product_id: value,
                          odoo_product_name: product?.display_name || product?.name || '',
                          description: product?.display_name || product?.name || line.description,
                        });
                      }}
                    >
                      <option value="">{t('selectServiceProduct')}</option>
                      {serviceProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.display_name || product.name}
                        </option>
                      ))}
                    </SelectField>
                  )}
                  <Input
                    name={`amount-${line.key}`}
                    label={t('annualAmountUntaxedWithTax', {
                      tax: taxSelection === 'taxable' ? `${t('taxable')} (15%)` : t('zeroRated'),
                    })}
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={line.annual_amount_untaxed}
                    onChange={(e) => updateLine(line.key, { annual_amount_untaxed: e.target.value })}
                  />
                </div>
                {line.line_type === 'rental' && (
                  <Input
                    name={`description-${line.key}`}
                    label={t('lineDescription')}
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                  />
                )}
                {line.line_type === 'service' && (
                  <Input
                    name={`description-${line.key}`}
                    label={t('lineDescription')}
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    placeholder={t('serviceFeePlaceholder')}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {t('totalAmountWithTax', {
              tax: taxSelection === 'taxable' ? `${t('taxable')} (15%)` : t('zeroRated'),
            })}
          </span>
          <span className="font-semibold tabular-nums">{formatCurrency(lineTotal, loc)}</span>
        </div>
        {fieldError('total_amount') && <p className="text-xs text-destructive">{fieldError('total_amount')}</p>}
      </div>

      <Input
        name="start_date"
        label={t('startDate')}
        type="date"
        value={values.start_date}
        onChange={(e) => setField('start_date', e.target.value)}
        onBlur={() => touch('start_date')}
        error={fieldError('start_date')}
        min="1990-01-01"
        max="2100-12-31"
      />
      <Input
        name="end_date"
        label={t('endDate')}
        type="date"
        value={values.end_date}
        onChange={(e) => setField('end_date', e.target.value)}
        onBlur={() => touch('end_date')}
        error={fieldError('end_date')}
        min="1990-01-01"
        max="2100-12-31"
      />

      <SelectField
        label={t('paymentCycle')}
        name="payment_cycle"
        value={values.payment_cycle}
        onChange={(value) => setField('payment_cycle', value as PaymentCycle)}
        onBlur={() => touch('payment_cycle')}
        error={fieldError('payment_cycle')}
      >
        {(['monthly', 'quarterly', 'semi_annual', 'yearly'] as const).map((cycle) => (
          <option key={cycle} value={cycle}>{tc(`paymentCycle.${cycle}`)}</option>
        ))}
      </SelectField>

      <SelectField
        label={t('taxMode')}
        name="tax_selection"
        value={taxSelection}
        onChange={(value) => {
          const next = value as 'taxable' | 'zero_rated';
          setTaxSelection(next);
          setValues((previous) => ({
            ...previous,
            lines: previous.lines.map((line) => ({
              ...line,
              tax_rate: next === 'taxable' ? '15' : '0',
              tax_treatment: next === 'zero_rated' ? 'zero_rated' : 'standard',
            })),
          }));
        }}
      >
        <option value="taxable">{t('taxable')}</option>
        <option value="zero_rated">{t('zeroRated')}</option>
      </SelectField>

      {(preview.ready || errors.schedule) && (
        <div
          className={cn(
            'rounded-xl border p-4 space-y-2',
            errors.schedule ? 'border-destructive bg-destructive/5' : 'border-border bg-muted/30',
          )}
        >
          <p className="text-sm font-medium">
            {errors.schedule
              ? t(`validation.${errors.schedule}` as `validation.${ContractFormErrorCode}`)
              : t('previewTitle', { count: preview.invoiceCount })}
          </p>
          {preview.ready && (
            <>
              <p className="text-xs text-muted-foreground">
                {t('previewSummary', {
                  total: formatCurrency(preview.totalAmount, loc),
                  paid: preview.fullyPaidCount,
                  partial: preview.partiallyPaidCount,
                  due: preview.dueCount,
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('previewTaxSummary', {
                  untaxed: formatCurrency(preview.totalUntaxed, loc),
                  tax: formatCurrency(preview.totalTax, loc),
                  total: formatCurrency(preview.totalAmount, loc),
                })}
              </p>
              <div className="max-h-40 overflow-auto rounded-lg border border-border bg-card">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-start font-medium">#</th>
                      <th className="px-2 py-1.5 text-start font-medium">{t('period')}</th>
                      <th className="px-2 py-1.5 text-end font-medium">{t('amount')}</th>
                      <th className="px-2 py-1.5 text-end font-medium">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.periods.map((period, index) => (
                      <tr key={`${period.periodStart}-${period.periodEnd}`} className="border-t border-border">
                        <td className="px-2 py-1.5">{index + 1}</td>
                        <td className="px-2 py-1.5">
                          {formatDate(period.periodStart, loc)} – {formatDate(period.periodEnd, loc)}
                        </td>
                        <td className="px-2 py-1.5 text-end">{formatCurrency(period.amount, loc)}</td>
                        <td className="px-2 py-1.5 text-end">
                          {period.status === 'fully_paid'
                            ? t('previewPaid')
                            : period.status === 'partially_paid'
                              ? t('previewPartial')
                              : t('previewDue')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <Input
        name="notes"
        label={t('notes')}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="space-y-1.5">
        <label htmlFor="contract-pdf" className="text-sm font-medium text-foreground">
          {t('contractPdf')}
        </label>
        <input
          id="contract-pdf"
          name="contract_pdf"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
          className="field-control block w-full file:me-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
          disabled={Boolean(createdContractId && !pdfFile)}
        />
        <p className="text-xs text-muted-foreground">{t('contractPdfHint')}</p>
      </div>

      {openingBalanceEnabled && (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">{t('openingBalanceSection')}</p>
          <p className="text-xs text-muted-foreground">{t('openingBalanceHint')}</p>
          <p className="text-xs text-muted-foreground">{t('odooTrackingHint')}</p>
          {preview.ready && preview.odooTrackingStartDate && (
            <p className="rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
              {t('odooTrackingStartPreview', {
                start: preview.firstUnpaidPeriodStart ?? preview.odooTrackingStartDate,
                end: preview.firstUnpaidPeriodEnd ?? '—',
              })}
            </p>
          )}
          <Input
            name="paid_through_date"
            label={t('paidThroughDate')}
            type="date"
            value={values.paid_through_date}
            onChange={(e) => setField('paid_through_date', e.target.value)}
            onBlur={() => touch('paid_through_date')}
            error={fieldError('paid_through_date')}
            min="1990-01-01"
            max="2100-12-31"
          />
          <Input
            name="opening_paid_amount"
            label={t('openingPaidAmount')}
            type="number"
            step="0.01"
            min="0"
            value={values.opening_paid_amount}
            onChange={(e) => setField('opening_paid_amount', e.target.value)}
            onBlur={() => touch('opening_paid_amount')}
            error={fieldError('opening_paid_amount')}
          />
          <Input
            name="last_payment_date"
            label={t('lastPaymentDate')}
            type="date"
            value={values.last_payment_date}
            onChange={(e) => setField('last_payment_date', e.target.value)}
            onBlur={() => touch('last_payment_date')}
            error={fieldError('last_payment_date')}
            min={values.start_date || '1990-01-01'}
            max={values.end_date || '2100-12-31'}
          />
          <Input
            name="opening_notes"
            label={t('openingNotes')}
            value={values.opening_notes}
            onChange={(e) => setField('opening_notes', e.target.value)}
          />
        </div>
      )}

      <div className="rounded-xl border border-border p-4 space-y-3">
        <p className="text-sm font-medium text-muted-foreground">{t('tenantSection')}</p>

        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              name="odoo_partner_search"
              label={t('odooPartnerSearch')}
              value={partnerQuery}
              onChange={(e) => {
                const nextQuery = e.target.value;
                setPartnerQuery(nextQuery);
                setIsSearchingPartners(nextQuery.trim().length >= 2);
                if (nextQuery.trim().length < 2) setPartnerResults([]);
                if (tenantOdooPartnerId) {
                  clearSelectedPartner();
                }
              }}
              placeholder={t('odooPartnerSearchPlaceholder')}
            />
            <div className="flex items-end gap-2">
              {isSearchingPartners && (
                <p className="h-10 px-2 text-xs text-muted-foreground flex items-center">
                  {tc('loading')}
                </p>
              )}
              {tenantOdooPartnerId && (
                <Button type="button" variant="ghost" onClick={clearSelectedPartner}>
                  {t('newTenant')}
                </Button>
              )}
            </div>
          </div>

          {tenantOdooPartnerId && (
            <p className="mt-2 text-xs font-medium text-success">
              {t('selectedOdooPartner', { id: tenantOdooPartnerId })}
            </p>
          )}

          {partnerResults.length > 0 && (
            <div className="mt-3 max-h-48 overflow-auto rounded-lg border border-border bg-card">
              {partnerResults.map((partner) => (
                <button
                  key={partner.id}
                  type="button"
                  onClick={() => selectPartner(partner)}
                  className="block w-full border-b border-border px-3 py-2 text-start text-sm last:border-b-0 hover:bg-muted/50"
                >
                  <span className="font-medium">{getPartnerName(partner)}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {[getString(partner.phone), getString(partner.email), getString(partner.vat)].filter(Boolean).join(' · ') || `#${partner.id}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {!tenantOdooPartnerId && (
          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm">
            <input
              type="checkbox"
              checked={syncTenantToOdoo}
              onChange={(event) => setSyncTenantToOdoo(event.target.checked)}
              className="h-4 w-4"
            />
            {t('syncTenantToOdoo')}
          </label>
        )}

        <Input
          name="tenant_name"
          label={t('tenantName')}
          value={values.tenant_name}
          onChange={(e) => setField('tenant_name', e.target.value)}
          onBlur={() => touch('tenant_name')}
          error={fieldError('tenant_name')}
          required
        />
        <Input
          name="tenant_phone"
          label={t('tenantPhone')}
          type="tel"
          value={tenantPhone}
          onChange={(e) => setTenantPhone(e.target.value)}
        />
        <Input
          name="tenant_email"
          label={t('tenantEmail')}
          type="email"
          value={values.tenant_email}
          onChange={(e) => setField('tenant_email', e.target.value)}
          onBlur={() => touch('tenant_email')}
          error={fieldError('tenant_email')}
        />
        <Input
          name="tenant_national_id"
          label={t('tenantNationalId')}
          value={values.tenant_national_id}
          onChange={(e) => setField('tenant_national_id', e.target.value)}
          onBlur={() => touch('tenant_national_id')}
          error={fieldError('tenant_national_id')}
          inputMode="numeric"
          maxLength={10}
        />
        <Input
          name="tenant_vat"
          label={t('tenantVat')}
          value={tenantVat}
          onChange={(e) => setTenantVat(e.target.value)}
        />
        <Input
          name="tenant_street"
          label={t('tenantStreet')}
          value={tenantStreet}
          onChange={(e) => setTenantStreet(e.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            name="tenant_city"
            label={t('tenantCity')}
            value={tenantCity}
            onChange={(e) => setTenantCity(e.target.value)}
          />
          <Input
            name="tenant_country_code"
            label={t('tenantCountryCode')}
            value={tenantCountryCode}
            onChange={(e) => setTenantCountryCode(e.target.value.toUpperCase())}
            maxLength={2}
          />
        </div>
      </div>

      <div className="form-actions">
        <Button variant="outline" type="button" disabled={isSaving} onClick={onCancel}>
          {tc('cancel')}
        </Button>
        <Button type="submit" disabled={isSaving || (attempted && hasErrors)}>
          {isSaving ? tc('loading') : createdContractId ? t('retryPdfUpload') : t('create')}
        </Button>
      </div>
    </form>
  );
}
