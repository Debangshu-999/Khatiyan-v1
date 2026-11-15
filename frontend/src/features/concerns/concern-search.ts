/**
 * The concern search (user, 2026-11-14): by the concern's code (CON-…), any case,
 * any part of it. Shared by the owner's queues, history and monitor, and the tenant's
 * closed concerns, so "23" finds CON-2026-000023 the same way everywhere.
 */
export function matchesConcernCode(concern: { referenceCode?: string | null }, search: string) {
  const needle = search.trim().toUpperCase();
  return !needle || (concern.referenceCode ?? "").toUpperCase().includes(needle);
}

export function filterByConcernCode<T extends { referenceCode?: string | null }>(concerns: T[], search: string) {
  return search.trim() ? concerns.filter((concern) => matchesConcernCode(concern, search)) : concerns;
}
