const ARABIC_INDIC_ZERO = 0x0660;
const EASTERN_ARABIC_ZERO = 0x06f0;

export const NUMBER_GROUP_SEPARATOR = '.';
export const NUMBER_DECIMAL_SEPARATOR = ',';

export function normalizeArabicDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => {
    const codePoint = digit.charCodeAt(0);
    const zero = codePoint >= EASTERN_ARABIC_ZERO ? EASTERN_ARABIC_ZERO : ARABIC_INDIC_ZERO;
    return String(codePoint - zero);
  });
}

/**
 * Converts a user-entered localized number to the canonical value used by
 * forms and server actions: ASCII digits with "." as the decimal separator.
 */
export function normalizeNumberInputValue(value: string): string {
  const normalized = normalizeArabicDigits(value)
    .replace(/\u2212/g, '-')
    .replace(/\u066c/g, NUMBER_GROUP_SEPARATOR)
    .replace(/[\u066b,]/g, NUMBER_DECIMAL_SEPARATOR)
    .replace(/\s/g, '');

  const negative = normalized.startsWith('-');
  const unsigned = normalized.replace(/-/g, '').replace(/[^0-9.,]/g, '');
  const commaIndex = unsigned.lastIndexOf(NUMBER_DECIMAL_SEPARATOR);
  const lastDotIndex = unsigned.lastIndexOf(NUMBER_GROUP_SEPARATOR);

  let integerPart: string;
  let decimalPart: string | null = null;

  if (commaIndex >= 0 && lastDotIndex > commaIndex) {
    integerPart = unsigned.slice(0, lastDotIndex).replace(/[.,]/g, '');
    decimalPart = unsigned.slice(lastDotIndex + 1).replace(/[.,]/g, '');
  } else if (commaIndex >= 0) {
    const commaCount = [...unsigned.matchAll(/,/g)].length;
    const digitsAfterComma = unsigned.length - commaIndex - 1;
    const commaIsGrouping = lastDotIndex < 0 && commaCount === 1 && digitsAfterComma === 3;
    if (commaIsGrouping) {
      integerPart = unsigned.replace(/,/g, '');
    } else {
      integerPart = unsigned.slice(0, commaIndex).replace(/[.,]/g, '');
      decimalPart = unsigned.slice(commaIndex + 1).replace(/[.,]/g, '');
    }
  } else {
    const dotIndexes = [...unsigned.matchAll(/\./g)].map((match) => match.index ?? -1);
    const finalDotIndex = dotIndexes.at(-1) ?? -1;
    const digitsAfterLastDot = finalDotIndex >= 0 ? unsigned.length - finalDotIndex - 1 : -1;
    const dotIsDecimal = dotIndexes.length > 0
      && (digitsAfterLastDot === 0 || (dotIndexes.length === 1 && digitsAfterLastDot <= 2));

    if (dotIsDecimal) {
      integerPart = unsigned.slice(0, finalDotIndex).replace(/\./g, '');
      decimalPart = unsigned.slice(finalDotIndex + 1).replace(/\./g, '');
    } else {
      integerPart = unsigned.replace(/\./g, '');
    }
  }

  if (!integerPart && decimalPart === null) {
    return negative ? '-' : '';
  }

  const canonicalInteger = integerPart || '0';
  const sign = negative ? '-' : '';
  return decimalPart === null
    ? `${sign}${canonicalInteger}`
    : `${sign}${canonicalInteger}.${decimalPart}`;
}

export function formatNumberInputValue(value: string | number | readonly string[] | undefined): string {
  if (value == null || Array.isArray(value)) return '';

  const canonical = normalizeArabicDigits(String(value)).replace(/,/g, '.');
  const negative = canonical.startsWith('-');
  const unsigned = canonical.replace(/^-/, '');
  if (!/\d/.test(unsigned)) return negative ? '-' : '';

  const decimalIndex = unsigned.indexOf('.');
  const integerPart = (decimalIndex >= 0 ? unsigned.slice(0, decimalIndex) : unsigned)
    .replace(/\D/g, '');
  const decimalPart = decimalIndex >= 0
    ? unsigned.slice(decimalIndex + 1).replace(/\D/g, '')
    : null;
  const groupedInteger = (integerPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, NUMBER_GROUP_SEPARATOR);
  const sign = negative ? '-' : '';

  return decimalPart === null
    ? `${sign}${groupedInteger}`
    : `${sign}${groupedInteger}${NUMBER_DECIMAL_SEPARATOR}${decimalPart}`;
}

export function formatNumberParts(parts: Intl.NumberFormatPart[]): string {
  return parts.map((part) => {
    if (part.type === 'group') return NUMBER_GROUP_SEPARATOR;
    if (part.type === 'decimal') return NUMBER_DECIMAL_SEPARATOR;
    return part.value;
  }).join('');
}
