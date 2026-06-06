'use server';

import { requireAuth } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { createClient } from '@/lib/supabase/server';
import type { InvoiceStatus } from '@/types/database';

export type GlobalSearchResult = {
  id: string;
  type: 'unit' | 'invoice';
  title: string;
  subtitle: string;
  href: string;
};

type SearchLocation = { name_en?: string | null; name_ar?: string | null };
type SearchUnit = { unit_number?: string | null; location?: SearchLocation | SearchLocation[] | null };

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getInvoiceHref(status: InvoiceStatus, invoiceNumber: string) {
  const query = `search=${encodeURIComponent(invoiceNumber)}`;
  if (status === 'due') return `/due-this-month?${query}`;
  if (status === 'partially_paid') return `/partial-payments?${query}`;
  if (status === 'fully_paid') return `/fully-paid?${query}`;
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

export async function globalSearch(locale: string, query: string): Promise<GlobalSearchResult[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  await requireAuth(locale, { correlation_id: await getCorrelationId() });
  const supabase = await createClient();
  const pattern = `%${term.replaceAll('%', '').replaceAll('_', '')}%`;

  const [unitsResult, invoicesResult] = await Promise.all([
    supabase
      .from('units')
      .select('id, unit_number, location:locations(name_en, name_ar)')
      .ilike('unit_number', pattern)
      .order('unit_number')
      .limit(5),
    supabase
      .from('invoices')
      .select('id, invoice_number, status, unit:units(unit_number, location:locations(name_en, name_ar))')
      .ilike('invoice_number', pattern)
      .order('due_date', { ascending: false })
      .limit(5),
  ]);

  if (unitsResult.error) throw unitsResult.error;
  if (invoicesResult.error) throw invoicesResult.error;

  const units: GlobalSearchResult[] = (unitsResult.data ?? []).map((unit) => {
    const location = firstRelation(unit.location as SearchLocation | SearchLocation[] | null);
    return {
      id: unit.id,
      type: 'unit',
      title: unit.unit_number,
      subtitle: locale === 'ar'
        ? location?.name_ar ?? location?.name_en ?? ''
        : location?.name_en ?? location?.name_ar ?? '',
      href: `/units?search=${encodeURIComponent(unit.unit_number)}`,
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
      href: getInvoiceHref(status, invoice.invoice_number),
    };
  });

  return [...units, ...invoices];
}
