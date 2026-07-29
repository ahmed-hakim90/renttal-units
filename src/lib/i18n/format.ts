import type { Locale } from './routing';
import { formatNumberParts } from './numbers';

export function formatCurrency(amount: number, locale: Locale): string {
  const formatter = new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-SA', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
  });
  return formatNumberParts(formatter.formatToParts(amount));
}

export function formatDate(date: string | Date, locale: Locale): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-SA', {
    calendar: 'gregory',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function formatDateTime(date: string | Date, locale: Locale): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-SA', {
    calendar: 'gregory',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function formatNumber(num: number, locale: Locale): string {
  const formatter = new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-SA');
  return formatNumberParts(formatter.formatToParts(num));
}
