import type { Location, Unit } from '@/types/database';

export type OdooProductLabelParts = {
  code: string | null;
  title: string;
  subtitle: string | null;
};

function normalizeMatchText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[^a-z0-9\u0600-\u06ff\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseOdooProductLabel(product: {
  id: number;
  name?: string;
  default_code?: string | null;
  display_name?: string;
}): OdooProductLabelParts {
  const code = product.default_code?.trim() || null;
  const raw = (product.display_name || product.name || String(product.id)).trim();
  const withoutBracketCode = raw.replace(/^\[[^\]]+\]\s*/, '').trim();
  const arabicStart = withoutBracketCode.search(/[\u0600-\u06FF]/);

  if (arabicStart > 0) {
    return {
      code,
      title: withoutBracketCode.slice(0, arabicStart).trim(),
      subtitle: withoutBracketCode.slice(arabicStart).trim() || null,
    };
  }

  return {
    code,
    title: withoutBracketCode || raw,
    subtitle: null,
  };
}

export function suggestLocationForOdooProduct(
  product: {
    name?: string;
    default_code?: string | null;
    display_name?: string;
    suggested_location_id?: string | null;
  },
  locations: Location[]
): Location | null {
  if (product.suggested_location_id) {
    const analyticSuggestion = locations.find((location) => location.id === product.suggested_location_id);
    if (analyticSuggestion) return analyticSuggestion;
  }

  const haystack = normalizeMatchText(
    [product.display_name, product.name, product.default_code].filter(Boolean).join(' ')
  );
  if (!haystack) return null;

  let best: { location: Location; score: number } | null = null;

  for (const location of locations) {
    for (const name of [location.name_en, location.name_ar, location.odoo_analytic_account_name]) {
      if (!name) continue;
      const needle = normalizeMatchText(name);
      if (needle.length < 3) continue;
      if (!haystack.includes(needle)) continue;
      const score = needle.length;
      if (!best || score > best.score) best = { location, score };
    }
  }

  return best?.location ?? null;
}

export function suggestUnitForOdooProduct(
  product: { suggested_unit_number?: string; default_code?: string | null },
  units: Unit[],
  preferredLocationId?: string | null
): Unit | null {
  const candidates = units.filter((unit) => {
    if (unit.odoo_product_id) return false;
    if (preferredLocationId && unit.location_id !== preferredLocationId) return false;
    return true;
  });

  const suggested = (product.suggested_unit_number || product.default_code || '').trim().toLowerCase();
  if (!suggested) return candidates[0] ?? null;

  return (
    candidates.find((unit) => unit.unit_number.trim().toLowerCase() === suggested)
    ?? candidates.find((unit) => unit.unit_number.trim().toLowerCase().includes(suggested))
    ?? candidates.find((unit) => suggested.includes(unit.unit_number.trim().toLowerCase()))
    ?? null
  );
}
