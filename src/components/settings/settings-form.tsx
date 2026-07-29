'use client';

import { Fragment, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, ChevronDown, Link2, ScrollText, PlugZap, FilePlus2, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { updateSetting } from '@/lib/actions/admin';
import { createOdooTestDraftInvoice, getOdooSetupOptions, testOdooConnection, updateOdooSettings } from '@/lib/actions/odoo';
import { isFeatureDisabledResult } from '@/lib/features';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';
import { formatNumberParts } from '@/lib/i18n/numbers';
import { toast } from 'sonner';
import type { ContractTaxMode, OdooSyncLog, Setting } from '@/types/database';

type OdooIntegrationData = {
  settings: {
    enabled: boolean;
    url: string;
    database: string;
    username: string;
    hasApiKey: boolean;
    companyId: number | null;
    journalId: number | null;
    vatTaxId: number | null;
    incomeAccountId: number | null;
    productCategoryId: number | null;
    additionalProductCategoryIds: number[];
    serviceCategoryId: number | null;
    vatRate: number;
    defaultTaxMode: ContractTaxMode;
    startDateField: string;
    endDateField: string;
  };
  logs: OdooSyncLog[];
};

type OdooOption = {
  id: number;
  label: string;
};

type OdooSetupOptions = {
  companies: OdooOption[];
  journals: OdooOption[];
  taxes: OdooOption[];
  incomeAccounts: OdooOption[];
  productCategories: OdooOption[];
  dateFields: Array<{ name: string; label: string }>;
  diagnostics: Array<{
    model: string;
    operation: 'fields_get' | 'search_read';
    ok: boolean;
    count?: number;
    message?: string;
  }>;
};

export function SettingsForm({
  settings,
  locale,
  canEdit,
  canEditOdoo = false,
  odoo,
  showExperimentalOdooTools = true,
}: {
  settings: Setting[];
  locale: string;
  canEdit: boolean;
  canEditOdoo?: boolean;
  odoo: OdooIntegrationData | null;
  showExperimentalOdooTools?: boolean;
}) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const tFeature = useTranslations('featureFlags');
  const companySetting = settings.find((s) => s.key === 'company_name');
  const termsSetting = settings.find((s) => s.key === 'default_payment_terms_days');
  const graceSetting = settings.find((s) => s.key === 'overdue_grace_days');
  const reminderSetting = settings.find((s) => s.key === 'due_reminder_days');
  const { isSubmitting, runOnce } = useSingleSubmit();

  const companyValue = companySetting?.value as { en?: string; ar?: string } | undefined;
  const odooSettings = odoo?.settings;
  const [odooEnabled, setOdooEnabled] = useState(odooSettings?.enabled ?? false);
  const [odooUrl, setOdooUrl] = useState(odooSettings?.url ?? '');
  const [odooDatabase, setOdooDatabase] = useState(odooSettings?.database ?? '');
  const [odooUsername, setOdooUsername] = useState(odooSettings?.username ?? '');
  const [odooApiKey, setOdooApiKey] = useState('');
  const [companyId, setCompanyId] = useState(odooSettings?.companyId ? String(odooSettings.companyId) : '');
  const [journalId, setJournalId] = useState(odooSettings?.journalId ? String(odooSettings.journalId) : '');
  const [vatTaxId, setVatTaxId] = useState(odooSettings?.vatTaxId ? String(odooSettings.vatTaxId) : '');
  const [incomeAccountId, setIncomeAccountId] = useState(odooSettings?.incomeAccountId ? String(odooSettings.incomeAccountId) : '');
  const [productCategoryId, setProductCategoryId] = useState(odooSettings?.productCategoryId ? String(odooSettings.productCategoryId) : '');
  const [additionalProductCategoryIds, setAdditionalProductCategoryIds] = useState(
    (odooSettings?.additionalProductCategoryIds ?? []).join(', '),
  );
  const [serviceCategoryId, setServiceCategoryId] = useState(odooSettings?.serviceCategoryId ? String(odooSettings.serviceCategoryId) : '');
  const [vatRate, setVatRate] = useState(String(odooSettings?.vatRate ?? 15));
  const [testProductId, setTestProductId] = useState('9025');
  const [defaultTaxMode, setDefaultTaxMode] = useState<ContractTaxMode>(odooSettings?.defaultTaxMode ?? 'taxable');
  const [startDateField, setStartDateField] = useState(odooSettings?.startDateField ?? '');
  const [endDateField, setEndDateField] = useState(odooSettings?.endDateField ?? '');
  const [setupOptions, setSetupOptions] = useState<OdooSetupOptions | null>(null);
  const [showAdvancedOdoo, setShowAdvancedOdoo] = useState(false);
  const [showManualOdooIds, setShowManualOdooIds] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const setupHasAccountingChoices = Boolean(
    setupOptions && (setupOptions.journals.length > 0 || setupOptions.taxes.length > 0 || setupOptions.incomeAccounts.length > 0)
  );
  const allowOdooEdit = Boolean(odoo && canEditOdoo);

  const numberOrNull = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? Number(trimmed) : null;
  };

  const positiveNumberList = (value: string) => [...new Set(value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((number) => Number.isSafeInteger(number) && number > 0))];

  function chooseExistingOrFirst(current: string, options: OdooOption[]) {
    if (current && options.some((option) => String(option.id) === current)) return current;
    return options[0] ? String(options[0].id) : current;
  }

  function getOdooLogActionLabel(action: string) {
    const known = [
      'test_connection',
      'create_test_draft_invoice',
      'link_product',
      'create_product',
      'create_invoice',
      'update_invoice',
      'sync_invoice',
      'load_setup_options',
      'suggest_product_locations',
      'sync_linked_unit_details',
      'import_location_products',
      'find_or_create_partner',
      'import_legacy_invoices',
      'create_unit_from_product',
    ] as const;
    return known.includes(action as typeof known[number])
      ? t(`odooLogActions.${action}` as `odooLogActions.${typeof known[number]}`)
      : t('odooLogActions.other');
  }

  function getOdooLogStatusLabel(status: string) {
    if (status === 'synced') return t('odooLogStatuses.synced');
    if (status === 'failed') return t('odooLogStatuses.failed');
    if (status === 'needs_review') return t('odooLogStatuses.needsReview');
    return t('odooLogStatuses.notSynced');
  }

  function getOdooLogMessage(log: OdooSyncLog) {
    if (log.message?.trim()) return log.message;
    if (log.status === 'synced') return t('odooLogMessages.success');
    if (log.status === 'needs_review') return t('odooLogMessages.needsReview');
    if (log.action === 'test_connection') return t('odooLogMessages.connectionFailed');
    if (log.action === 'create_test_draft_invoice') return t('odooLogMessages.testInvoiceFailed');
    return t('odooLogMessages.failed');
  }

  function formatOdooLogDate(value: string) {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date(value));
  }

  function getOdooLogDataLabel(key: string) {
    const labels: Record<string, string> = {
      errorCount: t('odooLogDataLabels.errorCount'),
      linkedCount: t('odooLogDataLabels.linkedCount'),
      renamedCount: t('odooLogDataLabels.renamedCount'),
      updatedCount: t('odooLogDataLabels.updatedCount'),
      createdCount: t('odooLogDataLabels.createdCount'),
      skippedCount: t('odooLogDataLabels.skippedCount'),
      invoiceCount: t('odooLogDataLabels.invoiceCount'),
      contractCount: t('odooLogDataLabels.contractCount'),
      productCount: t('odooLogDataLabels.productCount'),
      companies: t('odooLogDataLabels.companies'),
      journals: t('odooLogDataLabels.journals'),
      taxes: t('odooLogDataLabels.taxes'),
      incomeAccounts: t('odooLogDataLabels.incomeAccounts'),
      productCategories: t('odooLogDataLabels.productCategories'),
      dateFields: t('odooLogDataLabels.dateFields'),
      partner_id: t('odooLogDataLabels.partnerId'),
      odoo_invoice_id: t('odooLogDataLabels.invoiceId'),
      product: t('odooLogDataLabels.product'),
      id: t('odooLogDataLabels.id'),
      name: t('odooLogDataLabels.name'),
      display_name: t('odooLogDataLabels.displayName'),
      default_code: t('odooLogDataLabels.reference'),
      categ_id: t('odooLogDataLabels.category'),
      product_tmpl_id: t('odooLogDataLabels.productTemplate'),
      startDateField: t('odooLogDataLabels.startDateField'),
      endDateField: t('odooLogDataLabels.endDateField'),
      analyticDistribution: t('odooLogDataLabels.analyticDistribution'),
      company: t('odooLogDataLabels.company'),
      journal: t('odooLogDataLabels.journal'),
      vatTax: t('odooLogDataLabels.vatTax'),
      incomeAccount: t('odooLogDataLabels.incomeAccount'),
      productCategory: t('odooLogDataLabels.productCategory'),
      serviceCategory: t('odooLogDataLabels.serviceCategory'),
    };
    return labels[key] ?? key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function renderOdooLogDataValue(key: string, value: unknown): React.ReactNode {
    if (value === null || value === undefined || value === '') {
      return <span className="text-muted-foreground">{t('odooLogEmptyValue')}</span>;
    }
    if (typeof value === 'boolean') {
      return (
        <Badge
          status={value ? 'success' : 'vacant'}
          label={value ? t('odooLogYes') : t('odooLogNo')}
        />
      );
    }
    if (typeof value === 'number') {
      const formattedValue = /id$/i.test(key)
        ? String(value)
        : formatNumberParts(new Intl.NumberFormat(locale).formatToParts(value));
      return <span dir="ltr">{formattedValue}</span>;
    }
    if (typeof value === 'string') {
      if (key === 'url' && /^https?:\/\//i.test(value)) {
        return (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('odooLogOpenInOdoo')}
          </a>
        );
      }
      return <span className="break-words" dir="auto">{value}</span>;
    }
    if (Array.isArray(value)) {
      if (value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'string') {
        return <span dir="auto">{value[1]} <span className="text-muted-foreground" dir="ltr">#{value[0]}</span></span>;
      }
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((item, index) => (
            <span key={index} className="rounded-md border border-border bg-background px-2 py-1">
              {renderOdooLogDataValue(String(index), item)}
            </span>
          ))}
        </div>
      );
    }

    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => (
          <div key={nestedKey} className="rounded-md border border-border bg-background p-2">
            <p className="mb-1 font-medium text-muted-foreground">{getOdooLogDataLabel(nestedKey)}</p>
            <div className="font-medium text-foreground">{renderOdooLogDataValue(nestedKey, nestedValue)}</div>
          </div>
        ))}
      </div>
    );
  }

  function renderOdooLogDetails(log: OdooSyncLog) {
    return (
      <div className="rounded-xl border border-border bg-background p-4">
        <dl className="grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-foreground">{t('odooLogTime')}</dt>
            <dd className="mt-0.5 text-muted-foreground">{formatOdooLogDate(log.created_at)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">{t('odooLogEntity')}</dt>
            <dd className="mt-0.5 break-all text-muted-foreground" dir="ltr">
              {log.entity_type}{log.entity_id ? ` · ${log.entity_id}` : ''}
            </dd>
          </div>
          {log.message && (
            <div className="sm:col-span-2">
              <dt className="font-semibold text-foreground">{t('odooLogTechnicalMessage')}</dt>
              <dd className="mt-0.5 break-words text-muted-foreground" dir="auto">{log.message}</dd>
            </div>
          )}
        </dl>
        {log.payload && Object.keys(log.payload).length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="font-semibold text-foreground">{t('odooLogPayload')}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(log.payload).map(([key, value]) => (
                <div key={key} className={key === 'product' ? 'rounded-lg border border-border bg-muted/20 p-3 sm:col-span-2 lg:col-span-3' : 'rounded-lg border border-border bg-muted/20 p-3'}>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{getOdooLogDataLabel(key)}</p>
                  <div className="text-sm font-medium text-foreground">{renderOdooLogDataValue(key, value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    await runOnce(async () => {
    const fd = new FormData(e.currentTarget);

    await Promise.all([
      updateSetting(locale, 'company_name', {
        en: fd.get('company_name_en'),
        ar: fd.get('company_name_ar'),
      }),
      updateSetting(locale, 'default_payment_terms_days', Number(fd.get('payment_terms'))),
      updateSetting(locale, 'overdue_grace_days', Number(fd.get('grace_days'))),
      updateSetting(locale, 'due_reminder_days', Number(fd.get('reminder_days'))),
    ]);

    toast.success(t('saved'));
    });
  }

  async function handleOdooSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!allowOdooEdit) return;
    await runOnce(async () => {
      const result = await updateOdooSettings(locale, {
        enabled: odooEnabled,
        url: odooUrl,
        database: odooDatabase,
        username: odooUsername,
        apiKey: odooApiKey.trim() || undefined,
        companyId: numberOrNull(companyId),
        journalId: numberOrNull(journalId),
        vatTaxId: numberOrNull(vatTaxId),
        incomeAccountId: numberOrNull(incomeAccountId),
        productCategoryId: numberOrNull(productCategoryId),
        additionalProductCategoryIds: positiveNumberList(additionalProductCategoryIds),
        serviceCategoryId: numberOrNull(serviceCategoryId),
        vatRate: Number(vatRate),
        defaultTaxMode,
        startDateField,
        endDateField,
      });
      if (result.success) toast.success(t('odooSettingsSaved'));
      else toast.error(t('odooSettingsSaveFailed'));
    });
  }

  async function handleLoadOdooOptions() {
    await runOnce(async () => {
      try {
        const options = await getOdooSetupOptions(locale, {
          url: odooUrl,
          database: odooDatabase,
          username: odooUsername,
          apiKey: odooApiKey.trim() || undefined,
        });
        if (isFeatureDisabledResult(options)) {
          toast.error(tFeature('featureDisabled'));
          return;
        }
        setSetupOptions(options);
        setCompanyId((current) => chooseExistingOrFirst(current, options.companies));
        setJournalId((current) => chooseExistingOrFirst(current, options.journals));
        setVatTaxId((current) => chooseExistingOrFirst(current, options.taxes));
        setIncomeAccountId((current) => chooseExistingOrFirst(current, options.incomeAccounts));
        setProductCategoryId((current) => chooseExistingOrFirst(current, options.productCategories));
        setStartDateField((current) => options.dateFields.some((field) => field.name === current) ? current : options.dateFields[0]?.name ?? current);
        setEndDateField((current) => options.dateFields.some((field) => field.name === current) ? current : options.dateFields[0]?.name ?? current);
        toast.success(t('odooOptionsLoaded', {
          journals: options.journals.length,
          taxes: options.taxes.length,
          accounts: options.incomeAccounts.length,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : t('odooOptionsLoadFailed');
        toast.error(message || t('odooOptionsLoadFailed'));
      }
    });
  }

  async function handleTestConnection() {
    await runOnce(async () => {
      const result = await testOdooConnection(locale, {
        enabled: true,
        url: odooUrl,
        database: odooDatabase,
        username: odooUsername,
        apiKey: odooApiKey.trim() || undefined,
        companyId: numberOrNull(companyId),
        journalId: numberOrNull(journalId),
        vatTaxId: numberOrNull(vatTaxId),
        incomeAccountId: numberOrNull(incomeAccountId),
        productCategoryId: numberOrNull(productCategoryId),
        additionalProductCategoryIds: positiveNumberList(additionalProductCategoryIds),
        serviceCategoryId: numberOrNull(serviceCategoryId),
        vatRate: Number(vatRate),
        defaultTaxMode,
        startDateField,
        endDateField,
      });
      setValidationMessage(result.message);
      if (result.ok) toast.success(`${t('odooConnectionOk')} ${result.message}`);
      else toast.error(`${t('odooConnectionFailed')} ${result.message}`);
    });
  }

  async function handleCreateTestInvoice() {
    if (!window.confirm(t('odooTestInvoiceConfirm'))) return;
    await runOnce(async () => {
      const result = await createOdooTestDraftInvoice(locale, {
        enabled: true,
        url: odooUrl,
        database: odooDatabase,
        username: odooUsername,
        apiKey: odooApiKey.trim() || undefined,
        companyId: numberOrNull(companyId),
        journalId: numberOrNull(journalId),
        vatTaxId: numberOrNull(vatTaxId),
        incomeAccountId: numberOrNull(incomeAccountId),
        productCategoryId: numberOrNull(productCategoryId),
        additionalProductCategoryIds: positiveNumberList(additionalProductCategoryIds),
        serviceCategoryId: numberOrNull(serviceCategoryId),
        vatRate: Number(vatRate),
        testProductId: numberOrNull(testProductId),
        defaultTaxMode,
        startDateField,
        endDateField,
      });
      if (isFeatureDisabledResult(result)) {
        toast.error(tFeature('featureDisabled'));
        return;
      }
      if (result.ok) toast.success(t('odooTestInvoiceCreated'));
      else toast.error(`${t('odooTestInvoiceFailed')} ${result.message}`);
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <form onSubmit={handleSubmit} className="surface-panel space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="icon-tile bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t('companyName')}</h2>
            {!canEdit && <p className="mt-1 text-sm text-amber-700">{t('adminOnly')}</p>}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="company_name_en" label={t('companyNameEn')} defaultValue={companyValue?.en ?? ''} disabled={!canEdit || isSubmitting} />
          <Input name="company_name_ar" label={t('companyNameAr')} defaultValue={companyValue?.ar ?? ''} disabled={!canEdit || isSubmitting} />
          <Input name="payment_terms" label={t('defaultPaymentTerms')} type="number" defaultValue={String(termsSetting?.value ?? 30)} disabled={!canEdit || isSubmitting} />
          <Input name="grace_days" label={t('overdueGraceDays')} type="number" defaultValue={String(graceSetting?.value ?? 7)} disabled={!canEdit || isSubmitting} />
          <Input name="reminder_days" label={t('dueReminderDays')} type="number" min="0" max="90" defaultValue={String(reminderSetting?.value ?? 7)} disabled={!canEdit || isSubmitting} />
        </div>
        {canEdit && (
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? tc('loading') : tc('save')}</Button>
          </div>
        )}
      </form>

      {odoo && (
        <>
      <form onSubmit={handleOdooSubmit} className="surface-panel space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="icon-tile bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t('odooTitle')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('odooSubtitle')}</p>
            </div>
          </div>
          <Badge
            status={odoo.settings.enabled ? 'success' : 'vacant'}
            label={odoo.settings.enabled ? t('odooStatusOn') : t('odooStatusOff')}
          />
        </div>
        <label className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          <input
            name="enabled"
            type="checkbox"
            checked={odooEnabled}
            onChange={(event) => setOdooEnabled(event.target.checked)}
            disabled={!allowOdooEdit || isSubmitting}
            className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
          />
          {t('odooEnabled')}
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <Input name="url" label={t('odooUrl')} value={odooUrl} onChange={(event) => setOdooUrl(event.target.value)} disabled={!allowOdooEdit || isSubmitting} />
          <Input name="database" label={t('odooDatabase')} value={odooDatabase} onChange={(event) => setOdooDatabase(event.target.value)} disabled={!allowOdooEdit || isSubmitting} />
          <Input name="username" label={t('odooUsername')} value={odooUsername} onChange={(event) => setOdooUsername(event.target.value)} disabled={!allowOdooEdit || isSubmitting} />
          <Input
            name="apiKey"
            label={odoo.settings.hasApiKey ? t('odooApiKeySaved') : t('odooApiKey')}
            type="password"
            value={odooApiKey}
            onChange={(event) => setOdooApiKey(event.target.value)}
            disabled={!allowOdooEdit || isSubmitting}
          />
        </div>
        {allowOdooEdit && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-muted/30 p-3">
            {showExperimentalOdooTools && (
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={handleLoadOdooOptions}>
                <ListFilter />
                {t('odooLoadChoices')}
              </Button>
            )}
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={handleTestConnection}>
              <PlugZap />
              {t('odooTestConnection')}
            </Button>
          </div>
        )}

        {setupOptions && (
          <div className="space-y-2">
            <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              {t('odooOptionsLoadedSummary', {
                journals: setupOptions.journals.length,
                taxes: setupOptions.taxes.length,
                accounts: setupOptions.incomeAccounts.length,
              })}
            </p>
            {!setupHasAccountingChoices && (
              <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                {t('odooAccountingChoicesMissing')}
              </p>
            )}
            {setupOptions.diagnostics.some((diagnostic) => !diagnostic.ok) && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <p className="font-semibold">{t('odooDiagnosticsFailed')}</p>
                <ul className="mt-2 space-y-1">
                  {setupOptions.diagnostics.filter((diagnostic) => !diagnostic.ok).map((diagnostic) => (
                    <li key={`${diagnostic.model}:${diagnostic.operation}`}>
                      {diagnostic.model}.{diagnostic.operation}: {diagnostic.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowManualOdooIds((value) => !value)}>
              {showManualOdooIds ? t('odooBackToChoices') : t('odooUseManualIds')}
            </Button>
          </div>
        )}

        {validationMessage && (
          <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
            {validationMessage}
          </p>
        )}

        {!setupOptions && !showManualOdooIds && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
            <p>{t('odooLoadChoicesHint')}</p>
            <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => setShowManualOdooIds(true)}>
              {t('odooUseManualIds')}
            </Button>
          </div>
        )}

        {(setupOptions || showManualOdooIds) && (
        <div className="grid gap-4 md:grid-cols-2">
          {setupOptions && !showManualOdooIds ? (
            <>
              <div>
                <label className="text-sm font-medium">{t('odooCompanyId')}</label>
                <select value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="field-control" disabled={!allowOdooEdit || isSubmitting}>
                  <option value="">{t('odooSelectOptional')}</option>
                  {setupOptions.companies.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </div>
              {setupOptions.journals.length > 0 && (
                <div>
                  <label className="text-sm font-medium">{t('odooJournalId')}</label>
                  <select value={journalId} onChange={(event) => setJournalId(event.target.value)} className="field-control" disabled={!allowOdooEdit || isSubmitting}>
                    <option value="">{t('odooSelectOptional')}</option>
                    {setupOptions.journals.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </div>
              )}
              {setupOptions.taxes.length > 0 && (
                <div>
                  <label className="text-sm font-medium">{t('odooVatTaxId')}</label>
                  <select value={vatTaxId} onChange={(event) => setVatTaxId(event.target.value)} className="field-control" disabled={!allowOdooEdit || isSubmitting}>
                    <option value="">{t('odooSelectOptional')}</option>
                    {setupOptions.taxes.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </div>
              )}
              {setupOptions.incomeAccounts.length > 0 && (
                <div>
                  <label className="text-sm font-medium">{t('odooIncomeAccountId')}</label>
                  <select value={incomeAccountId} onChange={(event) => setIncomeAccountId(event.target.value)} className="field-control" disabled={!allowOdooEdit || isSubmitting}>
                    <option value="">{t('odooSelectOptional')}</option>
                    {setupOptions.incomeAccounts.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </div>
              )}
              {setupOptions.productCategories.length > 0 && (
                <div>
                  <label className="text-sm font-medium">{t('odooProductCategoryId')}</label>
                  <select value={productCategoryId} onChange={(event) => setProductCategoryId(event.target.value)} className="field-control" disabled={!allowOdooEdit || isSubmitting}>
                    <option value="">{t('odooSelectOptional')}</option>
                    {setupOptions.productCategories.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </div>
              )}
              {setupOptions.productCategories.length > 0 && (
                <div>
                  <label className="text-sm font-medium">{t('odooServiceCategoryId')}</label>
                  <select value={serviceCategoryId} onChange={(event) => setServiceCategoryId(event.target.value)} className="field-control" disabled={!allowOdooEdit || isSubmitting}>
                    <option value="">{t('odooSelectOptional')}</option>
                    {setupOptions.productCategories.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </div>
              )}
            </>
          ) : (
            <>
              <Input name="companyId" label={t('odooCompanyId')} type="number" value={companyId} onChange={(event) => setCompanyId(event.target.value)} disabled={!allowOdooEdit || isSubmitting} />
              <Input name="journalId" label={t('odooJournalId')} type="number" value={journalId} onChange={(event) => setJournalId(event.target.value)} disabled={!allowOdooEdit || isSubmitting} />
              <Input name="vatTaxId" label={t('odooVatTaxId')} type="number" value={vatTaxId} onChange={(event) => setVatTaxId(event.target.value)} disabled={!allowOdooEdit || isSubmitting} />
              <Input name="incomeAccountId" label={t('odooIncomeAccountId')} type="number" value={incomeAccountId} onChange={(event) => setIncomeAccountId(event.target.value)} disabled={!allowOdooEdit || isSubmitting} />
              <Input name="productCategoryId" label={t('odooProductCategoryId')} type="number" value={productCategoryId} onChange={(event) => setProductCategoryId(event.target.value)} disabled={!allowOdooEdit || isSubmitting} />
              <Input name="serviceCategoryId" label={t('odooServiceCategoryId')} type="number" value={serviceCategoryId} onChange={(event) => setServiceCategoryId(event.target.value)} disabled={!allowOdooEdit || isSubmitting} />
            </>
          )}
          <div>
            <Input
              id="additionalProductCategoryIds"
              name="additionalProductCategoryIds"
              label={t('odooAdditionalProductCategoryIds')}
              value={additionalProductCategoryIds}
              onChange={(event) => setAdditionalProductCategoryIds(event.target.value)}
              placeholder="70, 85"
              inputMode="numeric"
              aria-describedby="additionalProductCategoryIdsHint"
              disabled={!allowOdooEdit || isSubmitting}
            />
            <p id="additionalProductCategoryIdsHint" className="mt-1.5 text-xs text-muted-foreground">
              {t('odooAdditionalProductCategoryIdsHint')}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">{t('odooDefaultTaxMode')}</label>
            <select value={defaultTaxMode} onChange={(event) => setDefaultTaxMode(event.target.value as ContractTaxMode)} className="field-control" disabled={!allowOdooEdit || isSubmitting}>
              <option value="taxable">{t('taxable')}</option>
              <option value="non_taxable">{t('nonTaxable')}</option>
            </select>
          </div>
          <Input name="vatRate" label={t('odooVatRate')} type="number" min="0" max="100" step="0.01" value={vatRate} onChange={(event) => setVatRate(event.target.value)} disabled={!allowOdooEdit || isSubmitting} />
        </div>
        )}

        {showExperimentalOdooTools && (
        <div className="rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setShowAdvancedOdoo((value) => !value)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
          >
            <span>{t('odooAdvanced')}</span>
            <span className="text-muted-foreground">{showAdvancedOdoo ? '−' : '+'}</span>
          </button>
          {showAdvancedOdoo && (
            <div className="grid gap-4 border-t border-border p-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {t('odooTestInvoiceWarning')}
                </p>
              </div>
              <Input name="testProductId" label={t('odooTestProductId')} type="number" value={testProductId} onChange={(event) => setTestProductId(event.target.value)} disabled={!allowOdooEdit || isSubmitting} />
              {setupOptions ? (
                <>
                  <div>
                    <label className="text-sm font-medium">{t('odooStartDateField')}</label>
                    <select value={startDateField} onChange={(event) => setStartDateField(event.target.value)} className="field-control" disabled={!allowOdooEdit || isSubmitting}>
                      {setupOptions.dateFields.map((field) => <option key={field.name} value={field.name}>{field.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('odooEndDateField')}</label>
                    <select value={endDateField} onChange={(event) => setEndDateField(event.target.value)} className="field-control" disabled={!allowOdooEdit || isSubmitting}>
                      {setupOptions.dateFields.map((field) => <option key={field.name} value={field.name}>{field.label}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <Input name="startDateField" label={t('odooStartDateField')} value={startDateField} onChange={(event) => setStartDateField(event.target.value)} disabled={!allowOdooEdit || isSubmitting} />
                  <Input name="endDateField" label={t('odooEndDateField')} value={endDateField} onChange={(event) => setEndDateField(event.target.value)} disabled={!allowOdooEdit || isSubmitting} />
                </>
              )}
              {allowOdooEdit && (
                <div className="md:col-span-2">
                  <Button type="button" variant="outline" disabled={isSubmitting} onClick={handleCreateTestInvoice}>
                    <FilePlus2 />
                    {t('odooCreateTestInvoice')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        )}
        {allowOdooEdit && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? tc('loading') : tc('save')}</Button>
          </div>
        )}
      </form>

      <div className="surface-panel p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="icon-tile bg-slate-100 text-slate-700">
            <ScrollText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t('odooLogs')}</h2>
          </div>
        </div>
        <div className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto md:hidden">
          {odoo.logs.map((log: OdooSyncLog) => {
            const isExpanded = expandedLogId === log.id;
            return (
              <article key={log.id} className="mobile-card">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium">{getOdooLogActionLabel(log.action)}</p>
                  <Badge status={log.status} label={getOdooLogStatusLabel(log.status)} />
                </div>
                <p className="mt-3 break-words text-sm text-muted-foreground" dir="auto">{getOdooLogMessage(log)}</p>
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  className="mt-3 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {isExpanded ? t('odooLogHideDetails') : t('odooLogViewDetails')}
                  <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isExpanded && <div className="mt-3">{renderOdooLogDetails(log)}</div>}
              </article>
            );
          })}
          {odoo.logs.length === 0 && (
            <p className="rounded-xl border border-border px-3 py-8 text-center text-sm text-muted-foreground">{t('odooNoLogs')}</p>
          )}
        </div>

        <div className="mt-4 hidden max-h-80 overflow-auto rounded-xl border border-border md:block">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
              <tr>
                <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('odooLogAction')}</th>
                <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('odooLogStatus')}</th>
                <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('odooLogMessage')}</th>
                <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('odooLogDetails')}</th>
              </tr>
            </thead>
            <tbody>
              {odoo.logs.map((log: OdooSyncLog) => {
                const isExpanded = expandedLogId === log.id;
                return (
                  <Fragment key={log.id}>
                    <tr className="border-t border-border">
                      <td className="px-3 py-2.5 font-medium">{getOdooLogActionLabel(log.action)}</td>
                      <td className="px-3 py-2.5">
                        <Badge status={log.status} label={getOdooLogStatusLabel(log.status)} />
                      </td>
                      <td className="max-w-md px-3 py-2.5 text-muted-foreground">{getOdooLogMessage(log)}</td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="inline-flex items-center gap-1 font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {isExpanded ? t('odooLogHideDetails') : t('odooLogViewDetails')}
                          <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-t border-border bg-muted/20">
                        <td colSpan={4} className="p-3">
                          {renderOdooLogDetails(log)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {odoo.logs.length === 0 && (
                <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={4}>{t('odooNoLogs')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
