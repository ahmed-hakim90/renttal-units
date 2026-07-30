'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  CalendarDays,
  FileText,
  Hash,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';
import {
  activateContract,
  createContract,
  deleteContractDraft,
  saveContractDraft,
  updateContract,
} from '@/lib/actions/contracts';
import { uploadContractPdf } from '@/lib/actions/contract-attachments';
import { searchOdooPartners, searchOdooProducts } from '@/lib/actions/odoo';
import { Button, buttonStyles } from '@/components/ui/button';
import { Input, InputControl } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { formatCurrency, formatDate } from '@/lib/i18n/format';
import { normalizeArabicDigits } from '@/lib/i18n/numbers';
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
import type { Contract, ContractLineType, PaymentCycle, Unit } from '@/types/database';
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

export type ContractServiceProductOption = {
  id: number;
  name: string;
  default_code: string | null;
  display_name: string;
};

export type ContractEditorInitialValues = Partial<ContractFormValues> & {
  notes?: string;
  applyVat?: boolean;
  tenant_phone?: string;
  tenant_odoo_partner_id?: number | null;
  tenant_vat?: string;
  tenant_street?: string;
  tenant_city?: string;
  tenant_country_code?: string;
  sync_tenant_to_odoo?: boolean;
};

function newLine(lineType: ContractLineType = 'rental'): ContractFormLineValues {
  return {
    key: `${lineType}-${Math.random().toString(36).slice(2, 10)}`,
    line_type: lineType,
    unit_id: '',
    description: '',
    amount: '',
    odoo_product_id: '',
    odoo_product_name: '',
    tax_rate: '15',
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
  lines: [],
};

export function contractToFormValues(contract: Contract): ContractEditorInitialValues {
  const lines = (contract.lines ?? []).map((line) => ({
    key: line.id,
    line_type: line.line_type,
    unit_id: line.unit_id ?? '',
    description: line.description ?? '',
    amount: line.amount != null ? String(line.amount) : '',
    odoo_product_id: line.odoo_product_id != null ? String(line.odoo_product_id) : '',
    odoo_product_name: line.odoo_product_name ?? '',
    tax_rate: String(line.tax_rate ?? 15),
  }));

  return {
    unit_id: contract.unit_id ?? '',
    contract_number: contract.contract_number ?? '',
    start_date: contract.start_date ?? '',
    end_date: contract.end_date ?? '',
    total_amount: String(contract.total_amount ?? ''),
    payment_cycle: contract.payment_cycle ?? 'quarterly',
    paid_through_date: contract.paid_through_date ?? '',
    opening_paid_amount: contract.opening_paid_amount
      ? String(contract.opening_paid_amount)
      : '',
    last_payment_date: contract.opening_payment_date ?? '',
    opening_notes: contract.opening_notes ?? '',
    tenant_name: contract.tenant?.full_name ?? '',
    tenant_email: contract.tenant?.email ?? '',
    tenant_national_id: contract.tenant?.national_id ?? '',
    lines,
    notes: contract.notes ?? '',
    applyVat: contract.tax_mode !== 'non_taxable',
    tenant_phone: contract.tenant?.phone ?? '',
    tenant_odoo_partner_id: contract.tenant?.odoo_partner_id ?? null,
    tenant_vat: contract.tenant?.vat ?? '',
    tenant_street: contract.tenant?.street ?? '',
    tenant_city: contract.tenant?.city ?? '',
    tenant_country_code: contract.tenant?.country_code ?? 'SA',
    sync_tenant_to_odoo: !contract.tenant?.odoo_partner_id,
  };
}

function Icon({ children }: { children: ReactNode }) {
  return <span className="inline-flex size-3.5 items-center justify-center [&_svg]:size-3.5">{children}</span>;
}

function SelectField({
  label,
  name,
  value,
  onChange,
  onBlur,
  error,
  icon,
  compact,
  disabled,
  children,
}: {
  label?: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  icon?: ReactNode;
  compact?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('space-y-1', compact && 'space-y-0')}>
      {label && !compact && (
        <label className="text-xs font-medium text-foreground">{label}</label>
      )}
      <div className="relative">
        {icon && (
          <span
            className="pointer-events-none absolute inset-y-0 start-0 z-[1] flex w-8 items-center justify-center text-muted-foreground"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <select
          name={name}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-label={label}
          className={cn(
            'flex h-8 w-full appearance-none rounded-md border border-border bg-card text-sm',
            'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25',
            'disabled:cursor-not-allowed disabled:bg-muted/60 disabled:opacity-70',
            icon ? 'ps-8 pe-7' : 'px-2 pe-7',
            compact && 'h-7 rounded border-transparent bg-transparent hover:border-border focus-visible:border-ring',
            error && 'border-destructive',
          )}
        >
          {children}
        </select>
      </div>
      {error && !compact && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SheetSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function unitSelectLabel(unit: Unit) {
  return unit.unit_number?.trim() || unit.odoo_product_reference?.trim() || unit.id;
}

function unitSelectKeywords(unit: Unit) {
  return [
    unit.unit_number,
    unit.odoo_product_reference,
    unit.odoo_product_name,
    unit.location?.name_en,
    unit.location?.name_ar,
    unit.odoo_product_id,
  ];
}

/** Units with an active contract stay out of the picker, except the line's current value. */
function selectableUnitsForLine(units: Unit[], selectedUnitIds: Set<string>, lineUnitId: string) {
  return units.filter((unit) => {
    if (unit.id === lineUnitId) return true;
    if (selectedUnitIds.has(unit.id)) return false;
    if (unit.active_contract) return false;
    if (unit.status === 'occupied') return false;
    return true;
  });
}

function buildInitialForm(initialValues?: ContractEditorInitialValues): ContractFormValues {
  return {
    ...EMPTY_FORM,
    ...initialValues,
    lines: initialValues?.lines ?? [],
  };
}

function buildInitialServiceProductOptions(
  cachedProducts: ContractServiceProductOption[],
  initialValues?: ContractEditorInitialValues,
) {
  const products = [...cachedProducts];
  const knownIds = new Set(products.map((product) => product.id));
  for (const line of initialValues?.lines ?? []) {
    const productId = Number(line.odoo_product_id);
    if (
      line.line_type !== 'service'
      || !Number.isSafeInteger(productId)
      || productId <= 0
      || knownIds.has(productId)
    ) continue;
    const label = line.odoo_product_name?.trim() || line.description?.trim() || String(productId);
    products.push({
      id: productId,
      name: label,
      display_name: label,
      default_code: null,
    });
    knownIds.add(productId);
  }
  return products;
}

export function ContractEditor({
  mode,
  contractId = null,
  initialValues,
  units,
  locale,
  openingBalanceEnabled,
  multiLineEnabled = true,
  canDeleteDraft = false,
  scheduleLocked = false,
  initialServiceProducts = [],
}: {
  mode: 'create' | 'edit-draft' | 'edit-active';
  contractId?: string | null;
  initialValues?: ContractEditorInitialValues;
  units: Unit[];
  locale: string;
  openingBalanceEnabled: boolean;
  multiLineEnabled?: boolean;
  canDeleteDraft?: boolean;
  /** Active contracts with issued/paid invoices cannot change schedule fields. */
  scheduleLocked?: boolean;
  initialServiceProducts?: ContractServiceProductOption[];
}) {
  const t = useTranslations('contracts');
  const tc = useTranslations('common');
  const tFeature = useTranslations('featureFlags');
  const loc = locale as Locale;
  const router = useRouter();

  const [values, setValues] = useState<ContractFormValues>(() => buildInitialForm(initialValues));
  const [applyVat, setApplyVat] = useState(initialValues?.applyVat ?? true);
  const [tenantPhone, setTenantPhone] = useState(initialValues?.tenant_phone ?? '');
  const [tenantOdooPartnerId, setTenantOdooPartnerId] = useState<number | null>(
    initialValues?.tenant_odoo_partner_id ?? null,
  );
  const [tenantVat, setTenantVat] = useState(initialValues?.tenant_vat ?? '');
  const [tenantStreet, setTenantStreet] = useState(initialValues?.tenant_street ?? '');
  const [tenantCity, setTenantCity] = useState(initialValues?.tenant_city ?? '');
  const [tenantCountryCode, setTenantCountryCode] = useState(
    initialValues?.tenant_country_code ?? 'SA',
  );
  const [syncTenantToOdoo, setSyncTenantToOdoo] = useState(
    initialValues?.sync_tenant_to_odoo ?? false,
  );
  const [partnerQuery, setPartnerQuery] = useState(initialValues?.tenant_name ?? '');
  const [partnerResults, setPartnerResults] = useState<OdooPartnerResult[]>([]);
  const [serviceProducts, setServiceProducts] = useState<ContractServiceProductOption[]>(
    () => buildInitialServiceProductOptions(initialServiceProducts, initialValues),
  );
  const serviceProductsLoadStartedRef = useRef(initialServiceProducts.length > 0);
  const [isSearchingPartners, setIsSearchingPartners] = useState(false);
  const partnerSearchSeq = useRef(0);
  const [notes, setNotes] = useState(initialValues?.notes ?? '');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [currentContractId, setCurrentContractId] = useState<string | null>(contractId ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<ContractFormField, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [validationMode, setValidationMode] = useState<'strict' | 'draft'>('strict');
  const autoSeeded = useRef(false);

  const lineTotal = sumContractLineAmounts(values.lines);
  const formValues = useMemo(() => ({
    ...values,
    total_amount: String(lineTotal || ''),
    unit_id: values.lines.find((line) => line.line_type === 'rental' && line.unit_id)?.unit_id ?? '',
  }), [lineTotal, values]);

  const errors = validateContractForm(formValues, {
    requireUnit: validationMode !== 'draft',
    mode: validationMode,
  });
  const preview = previewContractInvoices(formValues);
  const hasErrors = Object.keys(errors).length > 0;

  const selectedUnitIds = useMemo(
    () => new Set(values.lines.filter((line) => line.line_type === 'rental' && line.unit_id).map((line) => line.unit_id)),
    [values.lines],
  );

  useEffect(() => {
    if (!pdfFile) {
      setPdfPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pdfFile);
    setPdfPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfFile]);

  function choosePdfFile(file: File | null) {
    if (!file) {
      setPdfFile(null);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
      return;
    }
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      toast.error(t('pdfTypeInvalid'));
      if (pdfInputRef.current) pdfInputRef.current.value = '';
      return;
    }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      toast.error(t('pdfSizeInvalid'));
      if (pdfInputRef.current) pdfInputRef.current.value = '';
      return;
    }
    setPdfFile(file);
  }

  useEffect(() => {
    if (autoSeeded.current || multiLineEnabled || values.lines.length > 0) return;
    autoSeeded.current = true;
    setValues((prev) => ({ ...prev, lines: [newLine('rental')] }));
  }, [multiLineEnabled, values.lines.length]);

  useEffect(() => {
    if (!values.lines.some((line) => line.line_type === 'service')) return;
    if (serviceProductsLoadStartedRef.current) return;
    serviceProductsLoadStartedRef.current = true;
    void searchOdooProducts(locale, '', 500, 'service')
      .then((products) => setServiceProducts(products as ContractServiceProductOption[]))
      .catch(() => {
        toast.error(t('serviceProductsLoadFailed'));
      });
  }, [locale, t, values.lines]);

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
    if (!multiLineEnabled && values.lines.length >= 1) return;
    setValues((prev) => ({ ...prev, lines: [...prev.lines, newLine(lineType)] }));
    touch('lines');
    if (lineType === 'service') ensureServiceProductsLoaded();
  }

  function removeLine(key: string) {
    setValues((prev) => {
      if (!multiLineEnabled && prev.lines.length <= 1) return prev;
      return { ...prev, lines: prev.lines.filter((line) => line.key !== key) };
    });
    touch('lines');
  }

  function ensureServiceProductsLoaded() {
    if (serviceProductsLoadStartedRef.current) return;
    serviceProductsLoadStartedRef.current = true;
    void searchOdooProducts(locale, '', 500, 'service')
      .then((products) => setServiceProducts(products as ContractServiceProductOption[]))
      .catch(() => {
        toast.error(t('serviceProductsLoadFailed'));
      });
  }

  function changeLineType(key: string, nextType: ContractLineType) {
    setValues((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => {
        if (line.key !== key) return line;
        return {
          ...line,
          line_type: nextType,
          unit_id: nextType === 'rental' ? line.unit_id : '',
          odoo_product_id: nextType === 'service' ? line.odoo_product_id : '',
          odoo_product_name: nextType === 'service' ? line.odoo_product_name : '',
        };
      }),
    }));
    touch('lines');
    if (nextType === 'service') ensureServiceProductsLoaded();
  }

  function selectServiceProduct(key: string, productId: string) {
    const product = serviceProducts.find((item) => String(item.id) === productId);
    setValues((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => {
        if (line.key !== key) return line;
        return {
          ...line,
          odoo_product_id: productId,
          odoo_product_name: product?.display_name || product?.name || '',
          description: product?.display_name || product?.name || line.description,
        };
      }),
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
    if (error === 'contractNotDraft') return t('contractNotDraft');
    if (error === 'contractDraftSaveFailed') return t('contractDraftSaveFailed');
    if (error === 'contractActivateFailed') return t('contractActivateFailed');
    if (error === 'contractDraftDeleteFailed') return t('contractDraftDeleteFailed');
    if (error === 'contractNotFound') return t('contractNotFound');
    if (error === 'contractHasFinancialActivity') return t('contractHasFinancialActivity');
    if (error === 'contractNotActive') return t('contractNotActive');
    if (error === 'contractUpdateFailed') return t('contractUpdateFailed');
    if (error === 'openingBalanceOutOfRange') return t('validation.paidThroughOutOfRange');
    if (error === 'contractDatesInvalid') return t('validation.startDateInvalid');
    return t('validationFailed');
  }

  const isActiveEdit = mode === 'edit-active';
  const structureLocked = isActiveEdit;
  const showDraftActions = mode === 'create' || mode === 'edit-draft';

  function firstValidationMessage(fieldErrors: ReturnType<typeof validateContractForm>) {
    const order: ContractFormField[] = [
      'contract_number',
      'tenant_name',
      'start_date',
      'end_date',
      'unit_id',
      'lines',
      'total_amount',
      'paid_through_date',
      'opening_paid_amount',
      'last_payment_date',
      'tenant_email',
      'tenant_national_id',
      'payment_cycle',
      'schedule',
    ];
    for (const field of order) {
      const code = fieldErrors[field];
      if (code) return t(`validation.${code}` as `validation.${ContractFormErrorCode}`);
    }
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

  function clearSelectedPartner() {
    setTenantOdooPartnerId(null);
    setSyncTenantToOdoo(false);
    setField('tenant_name', '');
    setField('tenant_email', '');
    setField('tenant_national_id', '');
    setTenantPhone('');
    setTenantVat('');
    setTenantStreet('');
    setTenantCity('');
    setTenantCountryCode('SA');
    setPartnerResults([]);
  }

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
    // National ID is not always on Odoo partner; keep any existing draft value only if already set.
    setPartnerResults([]);
    setPartnerQuery(getPartnerName(partner));
    touch('tenant_name');
  }

  function mapLinesForPayload() {
    return values.lines.map((line, index) => ({
      line_type: line.line_type,
      unit_id: line.line_type === 'rental' ? (line.unit_id || null) : null,
      description: line.description.trim() || null,
      amount: Number(line.amount) || 0,
      odoo_product_id: line.line_type === 'rental'
        ? units.find((unit) => unit.id === line.unit_id)?.odoo_product_id ?? null
        : line.odoo_product_id ? Number(line.odoo_product_id) : null,
      odoo_product_name: line.line_type === 'rental'
        ? units.find((unit) => unit.id === line.unit_id)?.odoo_product_reference ?? null
        : line.odoo_product_name || null,
      tax_rate: Number(line.tax_rate) || 0,
      period_start: values.start_date || null,
      period_end: values.end_date || null,
      sort_order: index,
    }));
  }

  function buildActivatePayload() {
    return {
      contract_number: values.contract_number.trim(),
      start_date: values.start_date,
      end_date: values.end_date,
      payment_cycle: values.payment_cycle,
      tax_mode: applyVat ? ('taxable' as const) : ('non_taxable' as const),
      notes: notes.trim() || null,
      paid_through_date: openingBalanceEnabled ? values.paid_through_date.trim() || null : null,
      opening_paid_amount: openingBalanceEnabled && values.opening_paid_amount.trim()
        ? Number(values.opening_paid_amount)
        : null,
      opening_payment_date: openingBalanceEnabled ? values.last_payment_date.trim() || null : null,
      opening_notes: openingBalanceEnabled ? values.opening_notes.trim() || null : null,
      tenant_name: values.tenant_name.trim(),
      tenant_phone: normalizeArabicDigits(tenantPhone).trim() || null,
      tenant_email: values.tenant_email.trim() || null,
      tenant_national_id: values.tenant_national_id.trim() || null,
      tenant_odoo_partner_id: tenantOdooPartnerId,
      tenant_vat: tenantVat.trim() || null,
      tenant_street: tenantStreet.trim() || null,
      tenant_city: tenantCity.trim() || null,
      tenant_country_code: tenantCountryCode.trim().toUpperCase().slice(0, 2) || null,
      sync_tenant_to_odoo: syncTenantToOdoo,
      lines: mapLinesForPayload(),
    };
  }

  function buildDraftPayload() {
    return {
      contractId: currentContractId,
      contract_number: values.contract_number.trim(),
      start_date: values.start_date.trim() || null,
      end_date: values.end_date.trim() || null,
      payment_cycle: values.payment_cycle,
      tax_mode: applyVat ? ('taxable' as const) : ('non_taxable' as const),
      notes: notes.trim() || null,
      paid_through_date: openingBalanceEnabled ? values.paid_through_date.trim() || null : null,
      opening_paid_amount: openingBalanceEnabled && values.opening_paid_amount.trim()
        ? Number(values.opening_paid_amount)
        : null,
      opening_payment_date: openingBalanceEnabled ? values.last_payment_date.trim() || null : null,
      opening_notes: openingBalanceEnabled ? values.opening_notes.trim() || null : null,
      tenant_name: values.tenant_name.trim() || null,
      tenant_phone: normalizeArabicDigits(tenantPhone).trim() || null,
      tenant_email: values.tenant_email.trim() || null,
      tenant_national_id: values.tenant_national_id.trim() || null,
      tenant_odoo_partner_id: tenantOdooPartnerId,
      tenant_vat: tenantVat.trim() || null,
      tenant_street: tenantStreet.trim() || null,
      tenant_city: tenantCity.trim() || null,
      tenant_country_code: tenantCountryCode.trim().toUpperCase().slice(0, 2) || null,
      lines: mapLinesForPayload(),
    };
  }

  async function uploadPdfIfNeeded(contractIdForUpload: string) {
    if (!pdfFile) return true;
    const uploadData = new FormData();
    uploadData.set('file', pdfFile);
    const uploadResult = await uploadContractPdf(locale, contractIdForUpload, uploadData);
    if (!uploadResult.success) {
      toast.error(t('pdfUploadFailed'));
      return false;
    }
    setPdfFile(null);
    return true;
  }

  async function handleSaveDraft() {
    setValidationMode('draft');
    setAttempted(true);
    const draftErrors = validateContractForm(formValues, { mode: 'draft' });
    if (Object.keys(draftErrors).length > 0) {
      toast.error(firstValidationMessage(draftErrors));
      return;
    }
    if (isSaving) return;

    setIsSaving(true);
    try {
      const result = await saveContractDraft(locale, buildDraftPayload());
      if (!result.success || !result.data) {
        toast.error(result.error ? getActionErrorMessage(result.error) : t('contractDraftSaveFailed'));
        return;
      }

      const savedId = result.data.id;
      setCurrentContractId(savedId);
      await uploadPdfIfNeeded(savedId);
      toast.success(t('draftSaved'));

      if (mode === 'create') {
        router.push(`/contracts/${savedId}/edit`);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleActivate() {
    setValidationMode('strict');
    setAttempted(true);
    const strictErrors = validateContractForm(formValues, { requireUnit: true });
    if (!tenantOdooPartnerId) {
      touch('tenant_name');
      toast.error(t('odooPartnerRequired'));
      return;
    }
    if (Object.keys(strictErrors).length > 0) {
      toast.error(firstValidationMessage(strictErrors));
      return;
    }
    if (isSaving) return;

    setIsSaving(true);
    try {
      const payload = buildActivatePayload();
      const result = currentContractId
        ? await activateContract(locale, currentContractId, payload)
        : await createContract(locale, payload);

      if (!result.success || !result.data) {
        toast.error(result.error ? getActionErrorMessage(result.error) : t('contractActivateFailed'));
        return;
      }

      await uploadPdfIfNeeded(result.data.id);
      toast.success(t('contractActivated'));
      router.push(`/contracts/${result.data.id}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveActive() {
    if (!currentContractId || isSaving) return;
    setValidationMode('strict');
    setAttempted(true);
    const strictErrors = validateContractForm(formValues, { requireUnit: true });
    if (Object.keys(strictErrors).length > 0) {
      toast.error(firstValidationMessage(strictErrors));
      return;
    }

    setIsSaving(true);
    try {
      const payload = buildActivatePayload();
      const result = await updateContract(locale, currentContractId, {
        contract_number: payload.contract_number,
        start_date: payload.start_date,
        end_date: payload.end_date,
        payment_cycle: payload.payment_cycle,
        tax_mode: payload.tax_mode,
        notes: payload.notes,
        tenant_name: payload.tenant_name,
        tenant_phone: payload.tenant_phone,
        tenant_email: payload.tenant_email,
        tenant_national_id: payload.tenant_national_id,
        lines: payload.lines,
      });

      if (!result.success || !result.data) {
        toast.error(result.error ? getActionErrorMessage(result.error) : t('contractUpdateFailed'));
        return;
      }

      await uploadPdfIfNeeded(result.data.id);
      toast.success(tc('success'));
      router.push(`/contracts/${result.data.id}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteDraft() {
    if (!currentContractId || !canDeleteDraft || isSaving) return;
    setIsSaving(true);
    try {
      const result = await deleteContractDraft(locale, currentContractId);
      if (!result.success) {
        toast.error(result.error ? getActionErrorMessage(result.error) : t('contractDraftDeleteFailed'));
        return;
      }
      toast.success(tc('success'));
      router.push('/contracts');
    } finally {
      setIsSaving(false);
    }
  }

  const cellInputClass = cn(
    'h-8 w-full rounded-md border border-transparent bg-transparent text-sm',
    'hover:border-border focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30',
  );

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        {/* Sticky Odoo-style status / action bar */}
        <div className="sticky top-16 z-20 flex flex-col gap-2 border-b border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/90 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              {mode === 'edit-draft' ? t('draft') : mode === 'edit-active' ? t('active') : t('create')}
            </span>
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="text-[11px] text-muted-foreground">{t('totalAmount')}</span>
              <span className="truncate text-sm font-semibold tabular-nums">
                {formatCurrency(lineTotal, loc)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={currentContractId ? `/contracts/${currentContractId}` : '/contracts'}
              className={buttonStyles({
                variant: 'outline',
                size: 'sm',
                className: cn('h-8 px-2.5', isSaving && 'pointer-events-none opacity-50'),
              })}
            >
              {tc('cancel')}
            </Link>
            {showDraftActions ? (
              <>
                <Button type="button" variant="secondary" size="sm" className="h-8 px-2.5" disabled={isSaving} onClick={() => void handleSaveDraft()}>
                  {isSaving ? tc('loading') : t('saveDraft')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-2.5"
                  disabled={isSaving || (attempted && validationMode === 'strict' && hasErrors)}
                  onClick={() => void handleActivate()}
                >
                  {isSaving ? tc('loading') : t('activate')}
                </Button>
                {mode === 'edit-draft' && canDeleteDraft && currentContractId && (
                  <Button type="button" variant="destructive" size="sm" className="h-8 px-2.5" disabled={isSaving} onClick={() => void handleDeleteDraft()}>
                    {t('deleteDraft')}
                  </Button>
                )}
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                className="h-8 px-2.5"
                disabled={isSaving || (attempted && validationMode === 'strict' && hasErrors)}
                onClick={() => void handleSaveActive()}
              >
                {isSaving ? tc('loading') : t('saveChanges')}
              </Button>
            )}
          </div>
        </div>

        <div className="p-3 sm:p-4">
          {(scheduleLocked || structureLocked) && (
            <div className="mb-3 space-y-2">
              {structureLocked && (
                <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {t('unitsLockedHint')}
                </p>
              )}
              {scheduleLocked && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {t('scheduleLockedHint')}
                </p>
              )}
            </div>
          )}
          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] lg:gap-4">
            <div className="min-w-0 space-y-3">
          {/* Contract + tenant stacked on the left */}
          <div className="grid gap-4 xl:grid-cols-2 xl:gap-6">
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('contractDetails')}
              </h2>
              <Input
                name="contract_number"
                label={t('contractNumber')}
                icon={<Icon><Hash /></Icon>}
                dense
                className="shadow-none"
                value={values.contract_number}
                onChange={(e) => setField('contract_number', e.target.value)}
                onBlur={() => touch('contract_number')}
                error={fieldError('contract_number')}
                required
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  name="start_date"
                  label={t('startDate')}
                  type="date"
                  icon={<Icon><CalendarDays /></Icon>}
                  dense
                  className="shadow-none"
                  value={values.start_date}
                  onChange={(e) => setField('start_date', e.target.value)}
                  onBlur={() => touch('start_date')}
                  error={fieldError('start_date')}
                  min="1990-01-01"
                  max="2100-12-31"
                  disabled={scheduleLocked}
                />
                <Input
                  name="end_date"
                  label={t('endDate')}
                  type="date"
                  icon={<Icon><CalendarDays /></Icon>}
                  dense
                  className="shadow-none"
                  value={values.end_date}
                  onChange={(e) => setField('end_date', e.target.value)}
                  onBlur={() => touch('end_date')}
                  error={fieldError('end_date')}
                  min="1990-01-01"
                  max="2100-12-31"
                  disabled={scheduleLocked}
                />
              </div>
              <SelectField
                label={t('paymentCycle')}
                name="payment_cycle"
                value={values.payment_cycle}
                icon={<Icon><RefreshCw /></Icon>}
                onChange={(value) => setField('payment_cycle', value as PaymentCycle)}
                onBlur={() => touch('payment_cycle')}
                error={fieldError('payment_cycle')}
                disabled={scheduleLocked}
              >
                {(['quarterly', 'semi_annual', 'yearly'] as const).map((cycle) => (
                  <option key={cycle} value={cycle}>{tc(`paymentCycle.${cycle}`)}</option>
                ))}
              </SelectField>
              <label className={cn('flex items-center gap-2 text-sm', scheduleLocked && 'opacity-70')}>
                <input
                  type="checkbox"
                  checked={applyVat}
                  disabled={scheduleLocked}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setApplyVat(checked);
                    setValues((previous) => ({
                      ...previous,
                      lines: previous.lines.map((line) => ({ ...line, tax_rate: checked ? '15' : '0' })),
                    }));
                  }}
                  className="h-4 w-4"
                />
                {t('applyVat')}
              </label>
            </div>

            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('tenantSection')}
              </h2>
              <div>
                <Input
                  name="odoo_partner_search"
                  label={t('odooPartnerSearch')}
                  icon={<Icon><Search /></Icon>}
                  dense
                  className="shadow-none"
                  value={partnerQuery}
                  onChange={(e) => {
                    const nextQuery = e.target.value;
                    setPartnerQuery(nextQuery);
                    setIsSearchingPartners(nextQuery.trim().length >= 2);
                    if (nextQuery.trim().length < 2) setPartnerResults([]);
                    if (tenantOdooPartnerId) clearSelectedPartner();
                  }}
                  placeholder={t('odooPartnerSearchPlaceholder')}
                  onBlur={() => touch('tenant_name')}
                  error={
                    (attempted || touched.tenant_name) && !tenantOdooPartnerId
                      ? t('odooPartnerRequired')
                      : undefined
                  }
                />
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {isSearchingPartners && (
                    <p className="text-xs text-muted-foreground">{tc('loading')}</p>
                  )}
                </div>
                {partnerResults.length > 0 && !tenantOdooPartnerId && (
                  <div className="mt-1.5 max-h-36 overflow-auto rounded-md border border-border">
                    {partnerResults.map((partner) => (
                      <button
                        key={partner.id}
                        type="button"
                        onClick={() => selectPartner(partner)}
                        className="block w-full border-b border-border px-2.5 py-1.5 text-start text-sm last:border-b-0 hover:bg-muted/50"
                      >
                        <span className="font-medium">{getPartnerName(partner)}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {[getString(partner.phone), getString(partner.email), getString(partner.vat)].filter(Boolean).join(' · ') || `#${partner.id}`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {tenantOdooPartnerId && (
                  <div className="mt-1.5 flex items-start justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{values.tenant_name || getPartnerName({ id: tenantOdooPartnerId })}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[
                          tenantPhone,
                          values.tenant_email,
                          tenantVat,
                          t('selectedOdooPartner', { id: tenantOdooPartnerId }),
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2" onClick={clearSelectedPartner}>
                      {t('changeOdooPartner')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Contract lines — Odoo one2many style table */}
          <SheetSection title={t('linesSection')}>
            {fieldError('lines') && <p className="text-xs text-destructive">{fieldError('lines')}</p>}
            {fieldError('unit_id') && <p className="text-xs text-destructive">{fieldError('unit_id')}</p>}
            {fieldError('total_amount') && (
              <p className="text-xs text-destructive">{fieldError('total_amount')}</p>
            )}

            <div className="rounded-lg border border-border">
              {/* Desktop Odoo-style editable table */}
              <div className="hidden md:block">
                <table className="w-full table-fixed text-sm">
                  <thead className="border-b border-border bg-muted/50">
                    <tr>
                      <th className="w-[7.5rem] px-2 py-1.5 text-start text-[11px] font-semibold text-muted-foreground">
                        {t('lineType')}
                      </th>
                      <th className="w-[32%] px-2 py-1.5 text-start text-[11px] font-semibold text-muted-foreground">
                        {t('unit')} / {t('serviceProduct')}
                      </th>
                      <th className="px-2 py-1.5 text-start text-[11px] font-semibold text-muted-foreground">
                        {t('lineDescription')}
                      </th>
                      <th className="w-[8.5rem] px-2 py-1.5 text-end text-[11px] font-semibold text-muted-foreground">
                        {t('lineAmount')}
                      </th>
                      <th className="w-10 px-1 py-1.5" aria-label={tc('actions')} />
                    </tr>
                  </thead>
                  <tbody>
                    {values.lines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-5 text-center text-sm text-muted-foreground">
                          {t('linesEmptyHint')}
                        </td>
                      </tr>
                    ) : (
                      values.lines.map((line) => {
                        const availableUnits = selectableUnitsForLine(units, selectedUnitIds, line.unit_id);
                        return (
                          <tr key={line.key} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                            <td className="max-w-0 px-1 py-1 align-middle">
                              {multiLineEnabled ? (
                                <SelectField
                                  compact
                                  label={t('lineType')}
                                  name={`type-${line.key}`}
                                  value={line.line_type}
                                  disabled={structureLocked}
                                  onChange={(value) => changeLineType(line.key, value as ContractLineType)}
                                >
                                  <option value="rental">{t('rentalLine')}</option>
                                  <option value="service">{t('serviceLine')}</option>
                                </SelectField>
                              ) : (
                                <span className="px-2 text-xs text-muted-foreground">{t('rentalLine')}</span>
                              )}
                            </td>
                            <td className="max-w-0 px-1 py-1 align-middle">
                              {line.line_type === 'rental' ? (
                                <SearchableSelect
                                  compact
                                  searchable
                                  className="min-w-0"
                                  label={t('unit')}
                                  name={`unit-${line.key}`}
                                  value={line.unit_id}
                                  placeholder={t('selectUnit')}
                                  error={fieldError('unit_id') || fieldError('lines')}
                                  disabled={structureLocked}
                                  onChange={(value) => updateLine(line.key, { unit_id: value })}
                                  options={[
                                    { value: '', label: t('selectUnit') },
                                    ...availableUnits.map((unit) => ({
                                      value: unit.id,
                                      label: unitSelectLabel(unit),
                                      keywords: unitSelectKeywords(unit),
                                    })),
                                  ]}
                                />
                              ) : (
                                <SearchableSelect
                                  compact
                                  searchable
                                  className="min-w-0"
                                  label={t('serviceProduct')}
                                  name={`service-product-${line.key}`}
                                  value={line.odoo_product_id}
                                  placeholder={t('selectServiceProduct')}
                                  error={fieldError('lines')}
                                  disabled={structureLocked}
                                  onChange={(value) => selectServiceProduct(line.key, value)}
                                  options={[
                                    { value: '', label: t('selectServiceProduct') },
                                    ...serviceProducts.map((product) => ({
                                      value: String(product.id),
                                      label: product.display_name || product.name,
                                      keywords: [product.name, product.default_code, product.id],
                                    })),
                                  ]}
                                />
                              )}
                            </td>
                            <td className="max-w-0 px-1 py-1 align-middle">
                              <div className="relative min-w-0">
                                <span className="pointer-events-none absolute inset-y-0 start-0 z-[1] flex w-7 items-center justify-center text-muted-foreground" aria-hidden="true">
                                  <FileText className="size-3.5" />
                                </span>
                                <InputControl
                                  name={`description-${line.key}`}
                                  aria-label={t('lineDescription')}
                                  className={cn(cellInputClass, 'min-w-0 ps-7 pe-2')}
                                  value={line.description}
                                  onChange={(e) => updateLine(line.key, { description: e.target.value })}
                                  placeholder={line.line_type === 'service' ? t('serviceFeePlaceholder') : undefined}
                                />
                              </div>
                            </td>
                            <td className="px-1 py-1 align-middle">
                              <div className="relative min-w-0">
                                <span className="pointer-events-none absolute inset-y-0 start-0 z-[1] flex w-7 items-center justify-center text-muted-foreground" aria-hidden="true">
                                  <Wallet className="size-3.5" />
                                </span>
                                <InputControl
                                  name={`amount-${line.key}`}
                                  aria-label={t('lineAmount')}
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  disabled={scheduleLocked}
                                  className={cn(cellInputClass, 'min-w-0 ps-7 pe-2 text-end tabular-nums')}
                                  value={line.amount}
                                  onChange={(e) => updateLine(line.key, { amount: e.target.value })}
                                />
                              </div>
                            </td>
                            <td className="px-1 py-1 align-middle text-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => removeLine(line.key)}
                                disabled={structureLocked || (!multiLineEnabled && values.lines.length <= 1)}
                                aria-label={t('removeLine')}
                                title={t('removeLine')}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={3} className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
                            onClick={() => addLine('rental')}
                            disabled={structureLocked || (!multiLineEnabled && values.lines.length >= 1)}
                          >
                            <Plus className="size-3.5" />
                            {t('addALine')}
                          </button>
                          {multiLineEnabled && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
                              onClick={() => addLine('service')}
                              disabled={structureLocked}
                            >
                              <Plus className="size-3.5" />
                              {t('addServiceFee')}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-end text-sm font-semibold tabular-nums">
                        {formatCurrency(lineTotal, loc)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile stacked rows — no horizontal overflow */}
              <div className="md:hidden">
                {values.lines.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t('linesEmptyHint')}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {values.lines.map((line) => {
                      const availableUnits = selectableUnitsForLine(units, selectedUnitIds, line.unit_id);
                      return (
                        <li key={line.key} className="space-y-2 p-3">
                          <div className="flex items-start justify-between gap-2">
                            {multiLineEnabled ? (
                              <SelectField
                                compact
                                label={t('lineType')}
                                name={`type-m-${line.key}`}
                                value={line.line_type}
                                disabled={structureLocked}
                                onChange={(value) => changeLineType(line.key, value as ContractLineType)}
                              >
                                <option value="rental">{t('rentalLine')}</option>
                                <option value="service">{t('serviceLine')}</option>
                              </SelectField>
                            ) : (
                              <span className="text-xs text-muted-foreground">{t('rentalLine')}</span>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeLine(line.key)}
                              disabled={structureLocked || (!multiLineEnabled && values.lines.length <= 1)}
                              aria-label={t('removeLine')}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                          {line.line_type === 'rental' ? (
                            <SearchableSelect
                              searchable
                              label={t('unit')}
                              name={`unit-m-${line.key}`}
                              value={line.unit_id}
                              placeholder={t('selectUnit')}
                              disabled={structureLocked}
                              onChange={(value) => updateLine(line.key, { unit_id: value })}
                              options={[
                                { value: '', label: t('selectUnit') },
                                ...availableUnits.map((unit) => ({
                                  value: unit.id,
                                  label: unitSelectLabel(unit),
                                  keywords: unitSelectKeywords(unit),
                                })),
                              ]}
                            />
                          ) : (
                            <SearchableSelect
                              searchable
                              label={t('serviceProduct')}
                              name={`service-product-m-${line.key}`}
                              value={line.odoo_product_id}
                              placeholder={t('selectServiceProduct')}
                              disabled={structureLocked}
                              onChange={(value) => selectServiceProduct(line.key, value)}
                              options={[
                                { value: '', label: t('selectServiceProduct') },
                                ...serviceProducts.map((product) => ({
                                  value: String(product.id),
                                  label: product.display_name || product.name,
                                  keywords: [product.name, product.default_code, product.id],
                                })),
                              ]}
                            />
                          )}
                          <Input
                            name={`description-m-${line.key}`}
                            label={t('lineDescription')}
                            icon={<Icon><FileText /></Icon>}
                            dense
                            value={line.description}
                            onChange={(e) => updateLine(line.key, { description: e.target.value })}
                            placeholder={line.line_type === 'service' ? t('serviceFeePlaceholder') : undefined}
                          />
                          <Input
                            name={`amount-m-${line.key}`}
                            label={t('lineAmount')}
                            type="number"
                            step="0.01"
                            min="0.01"
                            icon={<Icon><Wallet /></Icon>}
                            dense
                            disabled={scheduleLocked}
                            value={line.amount}
                            onChange={(e) => updateLine(line.key, { amount: e.target.value })}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
                      onClick={() => addLine('rental')}
                      disabled={structureLocked || (!multiLineEnabled && values.lines.length >= 1)}
                    >
                      <Plus className="size-3.5" />
                      {t('addALine')}
                    </button>
                    {multiLineEnabled && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
                        onClick={() => addLine('service')}
                        disabled={structureLocked}
                      >
                        <Plus className="size-3.5" />
                        {t('addServiceFee')}
                      </button>
                    )}
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{formatCurrency(lineTotal, loc)}</p>
                </div>
              </div>
            </div>
          </SheetSection>

          {openingBalanceEnabled && (
            <SheetSection title={t('openingBalanceSection')}>
              <p className="text-[11px] text-muted-foreground">{t('openingBalanceHint')}</p>
              <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                  name="paid_through_date"
                  label={t('paidThroughDate')}
                  type="date"
                  icon={<Icon><CalendarDays /></Icon>}
                  dense
                  className="shadow-none"
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
                  icon={<Icon><Wallet /></Icon>}
                  dense
                  className="shadow-none"
                  value={values.opening_paid_amount}
                  onChange={(e) => setField('opening_paid_amount', e.target.value)}
                  onBlur={() => touch('opening_paid_amount')}
                  error={fieldError('opening_paid_amount')}
                />
                <Input
                  name="last_payment_date"
                  label={t('lastPaymentDate')}
                  type="date"
                  icon={<Icon><CalendarDays /></Icon>}
                  dense
                  className="shadow-none"
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
                  icon={<Icon><FileText /></Icon>}
                  dense
                  className="shadow-none"
                  value={values.opening_notes}
                  onChange={(e) => setField('opening_notes', e.target.value)}
                />
              </div>
            </SheetSection>
          )}

          <SheetSection title={t('notes')}>
            <Input
              name="notes"
              label={t('notes')}
              icon={<Icon><FileText /></Icon>}
              dense
              className="shadow-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </SheetSection>

          {(preview.ready || errors.schedule) && (
            <SheetSection
              title={
                errors.schedule
                  ? t(`validation.${errors.schedule}` as `validation.${ContractFormErrorCode}`)
                  : t('previewTitle', { count: preview.invoiceCount })
              }
            >
              {preview.ready && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {t('previewSummary', {
                      total: formatCurrency(preview.totalAmount, loc),
                      paid: preview.fullyPaidCount,
                      partial: preview.partiallyPaidCount,
                      due: preview.dueCount,
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('previewTaxSummary', {
                      untaxed: formatCurrency(preview.totalUntaxed, loc),
                      tax: formatCurrency(preview.totalTax, loc),
                      total: formatCurrency(preview.totalAmount, loc),
                    })}
                  </p>
                  <div className="max-h-52 overflow-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                        <tr className="border-b border-border">
                          <th className="px-2 py-1.5 text-start font-medium">#</th>
                          <th className="px-2 py-1.5 text-start font-medium">{t('period')}</th>
                          <th className="px-2 py-1.5 text-end font-medium">{t('amount')}</th>
                          <th className="px-2 py-1.5 text-end font-medium">{t('status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.periods.map((period, index) => (
                          <tr key={`${period.periodStart}-${period.periodEnd}`} className="border-b border-border last:border-b-0">
                            <td className="px-2 py-1.5">{index + 1}</td>
                            <td className="px-2 py-1.5">
                              {formatDate(period.periodStart, loc)} – {formatDate(period.periodEnd, loc)}
                            </td>
                            <td className="px-2 py-1.5 text-end tabular-nums">{formatCurrency(period.amount, loc)}</td>
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
                </div>
              )}
            </SheetSection>
          )}
            </div>

            <aside className="min-w-0 max-lg:order-first lg:sticky lg:top-32 lg:self-start">
              <section className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <div className="min-w-0">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('contractPdf')}
                    </h2>
                    {pdfFile && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground" dir="auto">
                        {pdfFile.name}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {pdfFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => choosePdfFile(null)}
                      >
                        {t('removeContractPdf')}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5"
                      onClick={() => pdfInputRef.current?.click()}
                    >
                      <Upload className="size-3.5" />
                      {pdfFile ? t('replaceContractPdf') : t('uploadContractPdf')}
                    </Button>
                  </div>
                </div>

                <input
                  ref={pdfInputRef}
                  id="contract-pdf"
                  name="contract_pdf"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(event) => choosePdfFile(event.target.files?.[0] ?? null)}
                />

                {pdfPreviewUrl ? (
                  <iframe
                    src={pdfPreviewUrl}
                    title={t('documentPreviewTitle', { filename: pdfFile?.name ?? 'contract.pdf' })}
                    className="h-[min(70vh,42rem)] min-h-[22rem] w-full bg-muted/20"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => pdfInputRef.current?.click()}
                    className="flex min-h-[22rem] w-full flex-col items-center justify-center gap-3 px-6 py-10 text-center transition-colors hover:bg-muted/30"
                  >
                    <span className="flex size-12 items-center justify-center rounded-full border border-dashed border-border bg-muted/40 text-muted-foreground">
                      <Upload className="size-5" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{t('uploadContractPdf')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t('pdfPreviewEmpty')}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{t('contractPdfHint')}</p>
                    </div>
                  </button>
                )}
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
