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
