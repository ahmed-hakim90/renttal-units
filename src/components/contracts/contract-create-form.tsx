'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { createContract } from '@/lib/actions/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate } from '@/lib/i18n/format';
import {
  previewContractInvoices,
  validateContractForm,
  type ContractFormErrorCode,
  type ContractFormField,
  type ContractFormValues,
} from '@/lib/rental/contract-form-validation';
import { cn } from '@/lib/utils';
import type { PaymentCycle, Unit } from '@/types/database';
import type { Locale } from '@/lib/i18n/routing';

const EMPTY_FORM: ContractFormValues = {
  unit_id: '',
  contract_number: '',
  start_date: '',
  end_date: '',
  total_amount: '',
  payment_cycle: 'monthly',
  paid_through_date: '',
  opening_paid_amount: '',
  tenant_name: '',
  tenant_email: '',
  tenant_national_id: '',
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
  onBlur: () => void;
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
}: {
  units: Unit[];
  locale: string;
  onSuccess: () => void;
  onCancel: () => void;
  isSaving: boolean;
  setIsSaving: (saving: boolean) => void;
}) {
  const t = useTranslations('contracts');
  const tc = useTranslations('common');
  const loc = locale as Locale;

  const [values, setValues] = useState<ContractFormValues>(EMPTY_FORM);
  const [tenantPhone, setTenantPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState<Partial<Record<ContractFormField, boolean>>>({});
  const [attempted, setAttempted] = useState(false);

  const errors = validateContractForm(values, { requireUnit: true });
  const preview = previewContractInvoices(values);
  const hasErrors = Object.keys(errors).length > 0;

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

  function getActionErrorMessage(error: string) {
    if (error === 'activeContractExists') return t('activeContractExists');
    if (error === 'duplicateContractNumber') return t('duplicateContractNumber');
    if (error === 'duplicateNationalId') return t('duplicateNationalId');
    return error;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAttempted(true);
    if (hasErrors || isSaving) return;

    setIsSaving(true);
    try {
      const result = await createContract(locale, {
        unit_id: values.unit_id,
        contract_number: values.contract_number.trim(),
        start_date: values.start_date,
        end_date: values.end_date,
        total_amount: Number(values.total_amount),
        payment_cycle: values.payment_cycle,
        notes: notes.trim() || null,
        paid_through_date: values.paid_through_date.trim() || null,
        opening_paid_amount: values.opening_paid_amount.trim()
          ? Number(values.opening_paid_amount)
          : null,
        tenant_name: values.tenant_name.trim(),
        tenant_phone: tenantPhone.trim() || null,
        tenant_email: values.tenant_email.trim() || null,
        tenant_national_id: values.tenant_national_id.trim() || null,
      });

      if (result.success) {
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

      <SelectField
        label={t('unit')}
        name="unit_id"
        value={values.unit_id}
        onChange={(value) => setField('unit_id', value)}
        onBlur={() => touch('unit_id')}
        error={fieldError('unit_id')}
      >
        <option value="">{t('selectUnit')}</option>
        {units.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.unit_number} - {unit.location?.name_en ?? ''}
          </option>
        ))}
      </SelectField>

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
      <Input
        name="total_amount"
        label={t('totalAmount')}
        type="number"
        step="0.01"
        min="0.01"
        value={values.total_amount}
        onChange={(e) => setField('total_amount', e.target.value)}
        onBlur={() => touch('total_amount')}
        error={fieldError('total_amount')}
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

      <div className="rounded-xl border border-border p-4 space-y-3">
        <p className="text-sm font-medium text-muted-foreground">{t('openingBalanceSection')}</p>
        <p className="text-xs text-muted-foreground">{t('openingBalanceHint')}</p>
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
      </div>

      <div className="rounded-xl border border-border p-4 space-y-3">
        <p className="text-sm font-medium text-muted-foreground">{t('tenantSection')}</p>
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
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" type="button" disabled={isSaving} onClick={onCancel}>
          {tc('cancel')}
        </Button>
        <Button type="submit" disabled={isSaving || (attempted && hasErrors)}>
          {isSaving ? tc('loading') : t('create')}
        </Button>
      </div>
    </form>
  );
}
