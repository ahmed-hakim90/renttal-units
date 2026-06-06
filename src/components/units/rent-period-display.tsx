'use client';

import { useTranslations } from 'next-intl';
import { formatDate } from '@/lib/i18n/format';
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

function getRemainingProgressPercent(info: ReturnType<typeof getRentPeriodInfo>) {
  if (info.totalDays <= 0 || info.status === 'expired') return 0;
  if (info.status === 'not_started') return 100;

  return Math.round((info.remainingDays / info.totalDays) * 100);
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
  const remainingProgress = getRemainingProgressPercent(info);

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
      <div
        aria-label={remainingLabel}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={remainingProgress}
        className="mt-2 h-1.5 w-full min-w-28 overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${remainingProgress}%` }}
        />
      </div>
    </div>
  );
}
