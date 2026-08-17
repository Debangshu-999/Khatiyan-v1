import type { TenancyExitRequest, TenancyRoomChangeRequest } from "@/store/services/tenancy-api";

type AnyRequest = Pick<TenancyExitRequest | TenancyRoomChangeRequest, "expiresAt" | "status">;

/**
 * Whether a request is still something either party can act on.
 *
 * <p>Not the same as "undecided". An approved exit stays interactive through its
 * 3-day withdrawal window, and a rejected one through its 3-day re-raise window,
 * so both stay in the active list <em>showing their decision</em> rather than
 * vanishing into history the instant an owner taps a button. Only when the
 * window shuts is there nothing left to do.
 *
 * <p>Read from the server's `expiresAt` rather than recomputed here: if the
 * client derived it, the two would drift and the owner's list would disagree
 * with what the server considers open. A null value means an open-ended wait —
 * a withdrawal nobody has answered.
 */
export function isRequestActive(request: AnyRequest, now = Date.now()) {
  if (request.expiresAt == null) {
    return true;
  }
  return new Date(request.expiresAt).getTime() > now;
}

/** Counts for the overview tiles: active, expired, and the total of both. */
export function requestCounts<T extends AnyRequest>(requests: T[], now = Date.now()) {
  const active = requests.filter((request) => isRequestActive(request, now)).length;
  return { active, expired: requests.length - active, total: requests.length };
}

/**
 * Splits a list into what is still live and what is history.
 *
 * <p>Both halves keep their incoming order, so callers control sorting once.
 */
export function splitByActivity<T extends AnyRequest>(requests: T[], now = Date.now()) {
  const active: T[] = [];
  const history: T[] = [];

  for (const request of requests) {
    (isRequestActive(request, now) ? active : history).push(request);
  }

  return { active, history };
}

/**
 * Which slice of the live list a request screen is showing.
 *
 * <p>Shared so the three request screens cannot drift into different names for
 * the same three buckets.
 */
export type RequestFilter = "unattended" | "attended" | "all";

/**
 * Whether a request is still waiting on an owner decision.
 *
 * <p>Distinct from "active": an approved exit is active for its whole
 * withdrawal window but needs nothing from the owner, while a request nobody
 * has answered is the only kind that is actually holding someone up.
 *
 * <p>`WITHDRAWAL_REQUESTED` counts because it is a second decision on the same
 * request — the tenant has asked to undo an approved exit and is waiting again.
 * Room changes have no equivalent, so the check is simply inert for them.
 */
export function isRequestUnattended(request: AnyRequest) {
  return request.status === "REQUESTED" || request.status === "WITHDRAWAL_REQUESTED";
}

/**
 * Splits live requests into the ones waiting on the owner and the rest.
 *
 * <p>Order is preserved in both halves, so the caller keeps control of sorting.
 */
export function splitByAttention<T extends AnyRequest>(requests: T[]) {
  const unattended: T[] = [];
  const attended: T[] = [];

  for (const request of requests) {
    (isRequestUnattended(request) ? unattended : attended).push(request);
  }

  return { attended, unattended };
}

/**
 * Matches a request against a search term.
 *
 * <p>Matches the short code, so a tenant can quote "TEX-2026-000042" over the
 * phone and an owner can find it. The raw id is deliberately not searchable —
 * it is never shown, so nobody could be holding one.
 */
export function matchesRequestSearch(
  request: { referenceCode: string; tenantName?: string | null },
  term: string,
) {
  const needle = term.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return (
    request.referenceCode.toLowerCase().includes(needle)
    || (request.tenantName ?? "").toLowerCase().includes(needle)
  );
}
