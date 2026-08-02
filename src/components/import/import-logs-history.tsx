'use client';

import { Fragment, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/i18n/format';
import { type Locale } from '@/lib/i18n/routing';
import { ChevronDown, RotateCcw } from 'lucide-react';
import type { ImportLog } from '@/types/database';

function formatImportErrors(errors: ImportLog['errors']) {
  if (!Array.isArray(errors) || errors.length === 0) return '';
  try {
    return JSON.stringify(errors, null, 2);
  } catch {
    return String(errors);
  }
}

type RetryTarget = {
  href: string;
  labelKey: 'importLogRetryUnits' | 'importLogRetryContracts' | 'importLogRetryOdoo';
};

/**
 * Excel imports are not auto-replayed from stored logs (files are not retained).
 * Safe retry means guiding the operator back to the matching upload surface.
 */
function retryTargetFor(fileName: string): RetryTarget | null {
  const normalized = fileName.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('contract')) {
    return { href: '#import-contracts', labelKey: 'importLogRetryContracts' };
  }
  if (normalized.includes('odoo') || normalized.includes('legacy')) {
    return { href: '#odoo-import-center', labelKey: 'importLogRetryOdoo' };
  }
  if (
    normalized.includes('unit')
    || normalized === 'import.xlsx'
    || normalized.endsWith('.xlsx')
    || normalized.endsWith('.xls')
    || normalized.endsWith('.csv')
  ) {
    return { href: '#import-units', labelKey: 'importLogRetryUnits' };
  }
  return null;
}

export function ImportLogsHistory({
  logs,
  locale,
}: {
  logs: ImportLog[];
  locale: string;
}) {
  const t = useTranslations('units');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  return (
    <div className="surface-panel p-5 sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight">{t('importLogsTitle')}</h2>

      {logs.length === 0 ? (
        <p className="mt-4 rounded-xl border border-border px-3 py-8 text-center text-sm text-muted-foreground">
          {t('importLogsEmpty')}
        </p>
      ) : (
        <>
          <div className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto md:hidden">
            {logs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const errorsText = formatImportErrors(log.errors);
              const retry = log.error_count > 0 ? retryTargetFor(log.file_name) : null;
              return (
                <article key={log.id} className="mobile-card">
                  <p className="min-w-0 break-all font-medium" dir="auto">{log.file_name}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t('importLogTotal')}</dt>
                      <dd className="mt-0.5 font-medium">{log.total_rows}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t('importLogSuccess')}</dt>
                      <dd className="mt-0.5 font-medium">{log.success_count}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t('importLogErrors')}</dt>
                      <dd className="mt-0.5 font-medium">{log.error_count}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t('importLogDate')}</dt>
                      <dd className="mt-0.5">{formatDate(log.created_at, locale as Locale)}</dd>
                    </div>
                  </dl>
                  {log.error_count > 0 && (
                    <>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="mt-3 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {isExpanded ? t('importLogHideErrors') : t('importLogViewErrors')}
                        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      {isExpanded && (
                        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-xs text-foreground">
                          {errorsText || t('importLogNoErrors')}
                        </pre>
                      )}
                    </>
                  )}
                  {retry && (
                    <a
                      href={retry.href}
                      className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium"
                    >
                      <RotateCcw className="size-4" aria-hidden="true" />
                      {t(retry.labelKey)}
                    </a>
                  )}
                </article>
              );
            })}
          </div>

          <div className="mt-4 hidden max-h-80 overflow-auto rounded-xl border border-border md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr>
                  <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('importLogFile')}
                  </th>
                  <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('importLogTotal')}
                  </th>
                  <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('importLogSuccess')}
                  </th>
                  <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('importLogErrors')}
                  </th>
                  <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('importLogDate')}
                  </th>
                  <th className="px-3 py-2.5 text-end text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('errors')}
                  </th>
                  <th className="px-3 py-2.5 text-end text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('importLogRetry')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const errorsText = formatImportErrors(log.errors);
                  const retry = log.error_count > 0 ? retryTargetFor(log.file_name) : null;
                  return (
                    <Fragment key={log.id}>
                      <tr className="border-t border-border">
                        <td className="px-3 py-2.5 font-medium" dir="auto">{log.file_name}</td>
                        <td className="px-3 py-2.5">{log.total_rows}</td>
                        <td className="px-3 py-2.5">{log.success_count}</td>
                        <td className="px-3 py-2.5">{log.error_count}</td>
                        <td className="px-3 py-2.5">{formatDate(log.created_at, locale as Locale)}</td>
                        <td className="px-3 py-2.5 text-end">
                          {log.error_count > 0 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? t('importLogHideErrors') : t('importLogViewErrors')}
                              title={isExpanded ? t('importLogHideErrors') : t('importLogViewErrors')}
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            >
                              <ChevronDown
                                aria-hidden="true"
                                className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              />
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-end">
                          {retry ? (
                            <a
                              href={retry.href}
                              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                              title={t(retry.labelKey)}
                            >
                              <RotateCcw className="size-3.5" aria-hidden="true" />
                              {t('importLogRetry')}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-t border-border bg-muted/20">
                          <td colSpan={7} className="p-3">
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-xs text-foreground">
                              {errorsText || t('importLogNoErrors')}
                            </pre>
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
    </div>
  );
}
