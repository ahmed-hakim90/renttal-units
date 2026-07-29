'use server';

import { getAuthContext } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { createClient } from '@/lib/supabase/server';
import { FEATURE_FLAG_DEFAULTS } from '@/lib/features';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';
import type { InvoiceStatus } from '@/types/database';

export type GlobalSearchResult = {
  id: string;
  type: 'location' | 'unit' | 'contract' | 'invoice';
  title: string;
  subtitle: string;
  href: string;
};

type SearchLocation = { name_en?: string | null; name_ar?: string | null };
type SearchUnit = { unit_number?: string | null; location?: SearchLocation | SearchLocation[] | null };
type SearchTenant = { full_name?: string | null };
type SearchContract = {
  contract_number?: string | null;
  tenant?: SearchTenant | SearchTenant[] | null;
  unit?: SearchUnit | SearchUnit[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getInvoiceHref(
  status: InvoiceStatus,
  invoiceNumber: string,
  paymentStatusPagesEnabled: boolean,
) {
  const query = `search=${encodeURIComponent(invoiceNumber)}`;
  if (status === 'due') return `/due-this-month?${query}`;
  if (status === 'partially_paid') {
    return paymentStatusPagesEnabled ? `/partial-payments?${query}` : `/invoices?${query}`;
  }
  if (status === 'fully_paid') {
    return paymentStatusPagesEnabled ? `/fully-paid?${query}` : `/invoices?${query}`;
  }
  return `/invoices?${query}`;
}

function getStatusLabel(status: InvoiceStatus, locale: string) {
  const labels: Record<InvoiceStatus, { en: string; ar: string }> = {
    due: { en: 'Due', ar: 'مستحق' },
    invoice_issued: { en: 'Invoice Issued', ar: 'تم إصدار الفاتورة' },
    partially_paid: { en: 'Partially Paid', ar: 'مدفوع جزئياً' },
    fully_paid: { en: 'Fully Paid', ar: 'مدفوع بالكامل' },
    overdue: { en: 'Overdue', ar: 'متأخر' },
  };
  return locale === 'ar' ? labels[status].ar : labels[status].en;
}

function buildIlikeFilter(fields: string[], term: string) {
  const escapedTerm = term
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
  const pattern = `%${escapedTerm}%`;
  return fields.map((field) => `${field}.ilike."${pattern}"`).join(',');
}

export async function globalSearch(locale: string, query: string): Promise<GlobalSearchResult[]> {
  const term = query.trim().slice(0, 200);
  if (term.length < 2) return [];

  const auth = await getAuthContext({ correlation_id: await getCorrelationId() });
  if (!auth) return [];

  const featureFlags = await loadFeatureFlags({
    correlation_id: await getCorrelationId(),
    user_id: auth.userId,
    role: auth.role,
  }).catch(() => FEATURE_FLAG_DEFAULTS);

  const supabase = await createClient();
  const encodedTerm = encodeURIComponent(term);
  const canLocations = hasPermission(auth, 'locations.view');
  const canUnits = hasPermission(auth, 'units.view');
  const canContracts = hasPermission(auth, 'contracts.view');
  const canInvoices = hasPermission(auth, 'invoices.view');

  const [locationsResult, unitsResult, contractsResult, invoicesResult] = await Promise.all([
    canLocations
      ? supabase
        .from('locations')
        .select('id, name_en, name_ar, city, region')
        .or(buildIlikeFilter(
          ['name_en', 'name_ar', 'address', 'city', 'region', 'odoo_analytic_account_name'],
          term,
        ))
        .order(locale === 'ar' ? 'name_ar' : 'name_en')
        .limit(5)
      : Promise.resolve({ data: [], error: null }),
    canUnits
      ? supabase
        .from('units')
        .select('id, unit_number, location:locations(name_en, name_ar)')
        .or(buildIlikeFilter([
          'unit_number',
          'floor',
          'odoo_product_reference',
          'odoo_product_name',
          'odoo_product_display_name',
          'odoo_product_description',
          'odoo_product_category_name',
        ], term))
        .order('unit_number')
        .limit(5)
      : Promise.resolve({ data: [], error: null }),
    canContracts
      ? supabase
        .from('contracts')
        .select('id, contract_number, tenant:tenants(full_name), unit:units(unit_number, location:locations(name_en, name_ar))')
        .or(buildIlikeFilter(['contract_number', 'notes'], term))
        .order('created_at', { ascending: false })
        .limit(5)
      : Promise.resolve({ data: [], error: null }),
    canInvoices
      ? supabase
        .from('invoices')
        .select('id, invoice_number, status, unit:units(unit_number, location:locations(name_en, name_ar))')
        .or(buildIlikeFilter(['invoice_number', 'notes', 'odoo_invoice_name'], term))
        .order('due_date', { ascending: false })
        .limit(5)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (locationsResult.error || unitsResult.error || contractsResult.error || invoicesResult.error) {
    return [];
  }

  const locations: GlobalSearchResult[] = (locationsResult.data ?? []).map((location) => ({
    id: location.id,
    type: 'location',
    title: locale === 'ar' ? location.name_ar : location.name_en,
    subtitle: [location.city, location.region].filter(Boolean).join(' · '),
    href: `/locations?search=${encodedTerm}`,
  }));

  const units: GlobalSearchResult[] = (unitsResult.data ?? []).map((unit) => {
    const location = firstRelation(unit.location as SearchLocation | SearchLocation[] | null);
    return {
      id: unit.id,
      type: 'unit',
      title: unit.unit_number,
      subtitle: locale === 'ar'
        ? location?.name_ar ?? location?.name_en ?? ''
        : location?.name_en ?? location?.name_ar ?? '',
      href: `/units?search=${encodedTerm}`,
    };
  });

  const contracts: GlobalSearchResult[] = (contractsResult.data ?? []).map((contractRow) => {
    const contract = contractRow as SearchContract & { id: string };
    const tenant = firstRelation(contract.tenant);
    const unit = firstRelation(contract.unit);
    return {
      id: contract.id,
      type: 'contract',
      title: contract.contract_number ?? '',
      subtitle: [tenant?.full_name, unit?.unit_number].filter(Boolean).join(' · '),
      href: `/contracts/${contract.id}`,
    };
  });

  const invoices: GlobalSearchResult[] = (invoicesResult.data ?? []).map((invoice) => {
    const unit = firstRelation(invoice.unit as SearchUnit | SearchUnit[] | null);
    const status = invoice.status as InvoiceStatus;
    return {
      id: invoice.id,
      type: 'invoice',
      title: invoice.invoice_number,
      subtitle: `${unit?.unit_number ?? ''} · ${getStatusLabel(status, locale)}`,
      href: getInvoiceHref(
        status,
        invoice.invoice_number,
        featureFlags.invoices_payment_status_pages,
      ),
    };
  });

  return [...locations, ...units, ...contracts, ...invoices];
}
