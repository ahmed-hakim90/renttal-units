export async function collectPaginated<T>(
  loadPage: (offset: number, limit: number) => Promise<T[]>,
  options?: { pageSize?: number; maxRecords?: number },
) {
  const pageSize = Math.min(Math.max(options?.pageSize ?? 100, 1), 500);
  const maxRecords = Math.max(options?.maxRecords ?? 10_000, 1);
  const rows: T[] = [];

  while (rows.length < maxRecords) {
    const limit = Math.min(pageSize, maxRecords - rows.length);
    const page = await loadPage(rows.length, limit);
    rows.push(...page.slice(0, limit));
    if (page.length < limit) break;
  }

  return rows;
}
