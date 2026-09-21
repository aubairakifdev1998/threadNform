export type PaginationQuery = {
  page: number;
  pageSize: number;
};

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function normalizePagination(
  page?: number,
  pageSize?: number,
): PaginationQuery {
  const safePage = Math.max(1, Math.floor(page ?? 1));
  const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize ?? 20)));
  return { page: safePage, pageSize: safeSize };
}

export function paginated<T>(
  items: T[],
  total: number,
  query: PaginationQuery,
): PaginatedResult<T> {
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export function paginationOffset(query: PaginationQuery): number {
  return (query.page - 1) * query.pageSize;
}
