'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatNumber } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import type { AuditLogDisplayValue, AuditLogReadModel } from '@/types/database';

function displayValue(
  value: AuditLogDisplayValue,
  trueLabel: string,
  falseLabel: string,
  locale: Locale,
) {
  if (value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? trueLabel : falseLabel;
  if (typeof value === 'number') return formatNumber(value, locale);
  return String(value);
}

export function AuditLogList({
  logs,
  locale,
  compact = false,
}: {
  logs: AuditLogReadModel[];
  locale: string;
  compact?: boolean;
}) {
  const t = useTranslations('audit');
  const [selected, setSelected] = useState<AuditLogReadModel | null>(null);
  const loc = locale as Locale;

  if (logs.length === 0) {
    return <div className="surface-panel px-6 py-10 text-center text-muted-foreground">{t('empty')}</div>;
  }

  return (
    <>
      <div className={compact ? 'space-y-2' : 'table-shell'}>
        {compact ? logs.map((log) => (
          <button
            key={log.id}
            type="button"
            onClick={() => setSelected(log)}
            className="w-full rounded-xl border border-border p-3 text-start transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="font-medium">{t(`actions.${log.action}`)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {log.actor?.full_name || log.actor?.email || t('systemActor')} · {formatDateTime(log.created_at, loc)}
            </p>
          </button>
        )) : (
          <table>
            <thead>
              <tr>
                <th>{t('event')}</th>
                <th>{t('actor')}</th>
                <th>{t('entity')}</th>
                <th>{t('time')}</th>
                <th className="!text-end">{t('details')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="font-medium">{t(`actions.${log.action}`)}</td>
                  <td>
                    <span dir="auto">{log.actor?.full_name || t('systemActor')}</span>
                    {log.actor?.email && <span className="block text-xs text-muted-foreground" dir="ltr">{log.actor.email}</span>}
                  </td>
                  <td>{t(`entities.${log.entity_type}`)}</td>
                  <td className="whitespace-nowrap">{formatDateTime(log.created_at, loc)}</td>
                  <td className="text-end">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={t('view')}
                      aria-label={t('view')}
                      onClick={() => setSelected(log)}
                    >
                      <Eye aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? t(`actions.${selected.action}`) : t('details')}
        className="max-w-2xl"
      >
        {selected && (
          <div className="space-y-5">
            <dl className="grid gap-4 rounded-xl bg-muted/50 p-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">{t('actor')}</dt>
                <dd className="mt-1 font-medium" dir="auto">
                  {selected.actor?.full_name || selected.actor?.email || t('systemActor')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('time')}</dt>
                <dd className="mt-1 font-medium">{formatDateTime(selected.created_at, loc)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('entity')}</dt>
                <dd className="mt-1 font-medium">{t(`entities.${selected.entity_type}`)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('event')}</dt>
                <dd className="mt-1 font-medium">{t(`actions.${selected.action}`)}</dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-3 font-semibold">{t('changes')}</h3>
              {selected.changes.length === 0 ? (
                <p className="rounded-xl border border-border px-4 py-5 text-sm text-muted-foreground">
                  {t('noSafeDetails')}
                </p>
              ) : (
                <div className="space-y-2">
                  {selected.changes.map((change) => (
                    <div key={change.field} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[10rem_1fr_1fr]">
                      <p className="text-sm font-medium">{t(`fields.${change.field}`)}</p>
                      <div>
                        <p className="text-xs text-muted-foreground">{t('before')}</p>
                        <p className="mt-1 break-words text-sm" dir="auto">
                          {displayValue(change.old_value, t('yes'), t('no'), loc)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t('after')}</p>
                        <p className="mt-1 break-words text-sm" dir="auto">
                          {displayValue(change.new_value, t('yes'), t('no'), loc)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

