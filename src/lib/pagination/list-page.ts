export const DEFAULT_LIST_PAGE_SIZE = 50;
export const MAX_LIST_PAGE_SIZE = 100;
export const MAX_UNBOUNDED_LIST_ROWS = 500;

export type ListPageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function parseListPage(raw: string | number | undefined | null): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

export function parseListPageSize(
  raw: string | number | undefined | null,
  fallback = DEFAULT_LIST_PAGE_SIZE,
): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(MAX_LIST_PAGE_SIZE, Math.floor(value));
}

export function listPageRange(page: number, pageSize: number) {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(MAX_LIST_PAGE_SIZE, Math.max(1, pageSize));
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;
  return { from, to, page: safePage, pageSize: safeSize };
}

export function toListPageResult<T>(
  items: T[],
  total: number | null | undefined,
  page: number,
  pageSize: number,
): ListPageResult<T> {
  const safeTotal = Math.max(0, total ?? items.length);
  const totalPages = Math.max(1, Math.ceil(safeTotal / pageSize) || 1);
  return {
    items,
    total: safeTotal,
    page: Math.min(page, totalPages),
    pageSize,
    totalPages,
  };
}
