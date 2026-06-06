'use client';

import { useTranslations } from 'next-intl';
import { formatDate } from '@/lib/i18n/hooks';
import { breakdownDaysToDuration, getRentPeriodInfo } from '@/lib/rental/calculations';
import type { Locale } from '@/lib/i18n/routing';

function formatDurationBreakdown(
  days: number,
  t: ReturnType<typeof useTranslations<'units'>>,
  locale: Locale,
): string {
  const { years = 0, months = 0, days: remainingDays = 0 } = breakdownDaysToDuration(days);
  const parts: string[] = [];

  if (years > 0) parts.push(t('durationYears', { count: years }));
  if (months > 0) parts.push(t('durationMonths', { count: months }));
  if (remainingDays > 0 || parts.length === 0) {
    parts.push(t('durationDays', { count: remainingDays }));
  }

  return parts.join(locale === 'ar' ? ' و ' : ', ');
}

export function RentPeriodDisplay({
  startDate,
  endDate,
  locale,
}: {
  startDate: string;
  endDate: string;
  locale: Locale;
}) {
  const t = useTranslations('units');
  const info = getRentPeriodInfo(startDate, endDate);
  const durationLabel = formatDurationBreakdown(info.totalDays, t, locale);

  let remainingLabel: string;
  if (info.status === 'expired') {
    remainingLabel = t('periodExpired');
  } else if (info.status === 'not_started') {
    remainingLabel = t('periodStartsIn', {
      duration: formatDurationBreakdown(info.daysUntilStart, t, locale),
    });
  } else {
    remainingLabel = t('periodRemaining', {
      duration: formatDurationBreakdown(info.remainingDays, t, locale),
    });
  }

  return (
    <div>
      <p>{formatDate(startDate, locale)} - {formatDate(endDate, locale)}</p>
      <p className="mt-1 text-muted-foreground">{t('periodDuration', { duration: durationLabel })}</p>
      <p className="text-muted-foreground">{remainingLabel}</p>
    </div>
  );
}
