import type { Paginated } from '@gstflow/types';

export interface PaginationInput {
  page?: number;
  pageSize?: number;
}

export interface PaginationSlice {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function parsePagination(input: PaginationInput): PaginationSlice {
  const page = Math.max(1, Number(input.page ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(input.pageSize ?? 25) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginate<T>(items: T[], total: number, slice: PaginationSlice): Paginated<T> {
  return {
    items,
    total,
    page: slice.page,
    pageSize: slice.pageSize,
    totalPages: Math.max(1, Math.ceil(total / slice.pageSize)),
  };
}
