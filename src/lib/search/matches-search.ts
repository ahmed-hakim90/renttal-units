function normalizeSearchValue(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase();
}

export function matchesSearch(search: string, values: unknown[]) {
  const term = normalizeSearchValue(search.trim());
  if (!term) return true;

  return values.some((value) => (
    value !== null
    && value !== undefined
    && normalizeSearchValue(String(value)).includes(term)
  ));
}
