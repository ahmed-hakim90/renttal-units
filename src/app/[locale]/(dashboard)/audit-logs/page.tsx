import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { AuditLogList } from '@/components/audit/audit-log-list';
import { Button, buttonStyles } from '@/components/ui/button';
import { Link } from '@/lib/i18n/navigation';
import { getAuditLogs } from '@/lib/actions/audit';
import { requirePermission } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '@/lib/audit/catalog';

function selectedValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

function dateBoundary(value: string, endOfDay: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default async function AuditLogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  await requirePermission(locale, 'audit.view', {
    correlation_id: await getCorrelationId(),
  });
  const t = await getTranslations('audit');

  const action = selectedValue(query.action);
  const entityType = selectedValue(query.entity_type);
  const fromDate = selectedValue(query.from);
  const toDate = selectedValue(query.to);
  const requestedPage = Number(selectedValue(query.page) || '1');
  const logs = await getAuditLogs(locale, {
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    action: AUDIT_ACTIONS.includes(action as (typeof AUDIT_ACTIONS)[number])
      ? action as (typeof AUDIT_ACTIONS)[number]
      : undefined,
    entity_type: AUDIT_ENTITY_TYPES.includes(entityType as (typeof AUDIT_ENTITY_TYPES)[number])
      ? entityType as (typeof AUDIT_ENTITY_TYPES)[number]
      : undefined,
    from: dateBoundary(fromDate, false),
    to: dateBoundary(toDate, true),
  });

  function pageHref(page: number) {
    const next = new URLSearchParams();
    if (action) next.set('action', action);
    if (entityType) next.set('entity_type', entityType);
    if (fromDate) next.set('from', fromDate);
    if (toDate) next.set('to', toDate);
    if (page > 1) next.set('page', String(page));
    const suffix = next.toString();
    return suffix ? `/audit-logs?${suffix}` : '/audit-logs';
  }

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <form method="get" className="toolbar mb-4 grid gap-3 lg:grid-cols-5">
        <select name="action" defaultValue={action} className="field-control mt-0" aria-label={t('filterAction')}>
          <option value="">{t('allActions')}</option>
          {AUDIT_ACTIONS.map((item) => (
            <option key={item} value={item}>{t(`actions.${item}`)}</option>
          ))}
        </select>
        <select name="entity_type" defaultValue={entityType} className="field-control mt-0" aria-label={t('filterEntity')}>
          <option value="">{t('allEntities')}</option>
          {AUDIT_ENTITY_TYPES.map((item) => (
            <option key={item} value={item}>{t(`entities.${item}`)}</option>
          ))}
        </select>
        <input name="from" type="date" defaultValue={fromDate} className="field-control mt-0" aria-label={t('fromDate')} />
        <input name="to" type="date" defaultValue={toDate} className="field-control mt-0" aria-label={t('toDate')} />
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">{t('applyFilters')}</Button>
          <Link href="/audit-logs" className={buttonStyles({ variant: 'outline' })}>{t('clearFilters')}</Link>
        </div>
      </form>

      <AuditLogList logs={logs.items} locale={locale} />

      {logs.page_count > 1 && (
        <nav aria-label={t('pagination')} className="mt-4 flex items-center justify-between gap-3">
          <Link
            href={pageHref(Math.max(1, logs.page - 1))}
            aria-disabled={logs.page <= 1}
            className={buttonStyles({ variant: 'outline', className: logs.page <= 1 ? 'pointer-events-none opacity-50' : undefined })}
          >
            {t('previous')}
          </Link>
          <p className="text-sm text-muted-foreground">
            {t('pageStatus', { page: logs.page, count: logs.page_count, total: logs.total })}
          </p>
          <Link
            href={pageHref(Math.min(logs.page_count, logs.page + 1))}
            aria-disabled={logs.page >= logs.page_count}
            className={buttonStyles({ variant: 'outline', className: logs.page >= logs.page_count ? 'pointer-events-none opacity-50' : undefined })}
          >
            {t('next')}
          </Link>
        </nav>
      )}
    </div>
  );
}

