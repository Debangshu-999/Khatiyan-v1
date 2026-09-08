/**
 * Shared shape for paginated list endpoints, mirroring the backend
 * `PageResponse<T>` (see c_shared/api/PageResponse.java). Reused across the
 * history/data screens so they all page through results the same way.
 */
export type Page<T> = {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

/**
 * The same shape, cut from an array the screen already holds.
 *
 * <p>
 * For lists the server sends whole: a tenancy's bills, a month's cycles, a
 * property's exit requests. They are bounded, and the screen needs the full list
 * anyway for its summary tiles and filters — so paging the fetch would mean
 * asking twice for what we have once.
 *
 * <p>
 * {@code page} is clamped rather than trusted. A filter that shrinks the list
 * while the reader is on its last page would otherwise leave them looking at an
 * empty one, with a pager saying "Page 4 of 2".
 */
export function paginateArray<T>(items: T[], page: number, size: number) {
  const totalElements = items.length;
  const totalPages = Math.ceil(totalElements / size);
  const safePage = totalPages === 0 ? 0 : Math.min(page, totalPages - 1);
  const start = safePage * size;
  return {
    hasNext: safePage + 1 < totalPages,
    hasPrevious: safePage > 0,
    page: safePage,
    pageItems: items.slice(start, start + size),
    totalElements,
    totalPages,
  };
}
