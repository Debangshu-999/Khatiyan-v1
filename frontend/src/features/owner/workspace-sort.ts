import type { OwnerModule, OwnerModuleKey } from "@/features/owner/owner-modules";
import type { OwnerDashboard } from "@/store/services/dashboard-api";

/**
 * How the Manage tab orders its module cards (user, 2026-10-04):
 *
 * <ul>
 * <li>A to Z and Z to A, by name.</li>
 * <li>Dynamic: the module that most recently got something waiting on the
 * owner comes first.</li>
 * <li>Custom: the order the owner dragged the cards into.</li>
 * </ul>
 */
export type WorkspaceSortMode = "AZ" | "ZA" | "DYNAMIC" | "CUSTOM";

export const WORKSPACE_SORT_OPTIONS: { label: string; value: WorkspaceSortMode }[] = [
  { label: "A to Z", value: "AZ" },
  { label: "Z to A", value: "ZA" },
  { label: "Dynamic", value: "DYNAMIC" },
  { label: "Custom", value: "CUSTOM" },
];

/** What is waiting in a module, and when this device last saw that number go up. */
export type PendingMark = { at: number; count: number };

/** Keyed by property and module, `propertyId:moduleKey`: what waits is the property's own. */
export type PendingMarks = Record<string, PendingMark>;

export function pendingMarkKey(propertyId: string, moduleKey: string) {
  return `${propertyId}:${moduleKey}`;
}

/**
 * How many things are waiting on the owner in each module, from the dashboard's
 * own attention counts. Meals and notices have nothing that waits.
 *
 * <p>Only what asks for the owner's action. An agreement waiting on the tenant
 * or a tenant on notice is not counted: nothing is theirs to do about it.
 */
export function pendingByModule(dashboard: OwnerDashboard | undefined): Record<OwnerModuleKey, number> {
  const attention = dashboard?.attention;
  return {
    billing:
      (attention?.paymentsOverdue ?? 0) +
      (attention?.pendingDepositSettlements ?? 0) +
      (dashboard?.paymentIntents?.awaitingReview ?? 0),
    // Unassigned and escalated: the count on the Concern card's own badge.
    concern: (dashboard?.concerns?.open ?? 0) + (dashboard?.concerns?.escalated ?? 0),
    food: 0,
    notice: 0,
    // Enquiries are answered from the Property workspace.
    property: attention?.newEnquiries ?? 0,
    staff: attention?.salaryPaymentsDue ?? 0,
    tenancy:
      (attention?.pendingExitRequests ?? 0) +
      (attention?.pendingRoomChangeRequests ?? 0) +
      (attention?.exitsPastDue ?? 0),
  };
}

/**
 * The marks after looking at the dashboard again. A module whose count went up
 * is stamped now: it has just got something new. One whose count fell keeps
 * its stamp while anything still waits, and loses its mark at zero.
 *
 * <p>The stamp is when THIS device saw the count rise, not when the thing was
 * raised: the dashboard sends counts, not times. So the first look at a
 * property stamps everything waiting with the same moment, and those are then
 * ordered by how much waits.
 *
 * @return the same object when nothing changed, so a caller can skip a save
 */
export function refreshPendingMarks(
  marks: PendingMarks,
  propertyId: string,
  counts: Record<OwnerModuleKey, number>,
  now: number,
): PendingMarks {
  let next = marks;
  for (const [moduleKey, count] of Object.entries(counts)) {
    const key = pendingMarkKey(propertyId, moduleKey);
    const mark = marks[key];
    if (count === (mark?.count ?? 0)) {
      continue;
    }
    if (next === marks) {
      next = { ...marks };
    }
    if (count === 0) {
      delete next[key];
    } else {
      next[key] = { at: count > (mark?.count ?? 0) ? now : mark?.at ?? now, count };
    }
  }
  return next;
}

/** The cards in the chosen order. Never changes the list it is given. */
export function sortWorkspaceModules(
  modules: OwnerModule[],
  mode: WorkspaceSortMode,
  customOrder: string[],
  marks: PendingMarks,
  propertyId: string | null,
): OwnerModule[] {
  const byName = (left: OwnerModule, right: OwnerModule) => left.title.localeCompare(right.title);
  const sorted = [...modules].sort(byName);

  if (mode === "ZA") {
    return sorted.reverse();
  }
  if (mode === "CUSTOM") {
    // A module the owner has not placed yet (newly granted, newly built) goes
    // after the ones they have, by name.
    const placeOf = (module: OwnerModule) => {
      const at = customOrder.indexOf(module.key);
      return at < 0 ? Number.MAX_SAFE_INTEGER : at;
    };
    return sorted.sort((left, right) => placeOf(left) - placeOf(right));
  }
  if (mode === "DYNAMIC" && propertyId) {
    const markOf = (module: OwnerModule) => marks[pendingMarkKey(propertyId, module.key)];
    return sorted.sort((left, right) => {
      const leftMark = markOf(left);
      const rightMark = markOf(right);
      if (!leftMark || !rightMark) {
        // Anything waiting comes before nothing waiting. Two with nothing keep their names' order.
        return leftMark ? -1 : rightMark ? 1 : 0;
      }
      return rightMark.at - leftMark.at || rightMark.count - leftMark.count;
    });
  }
  return sorted;
}
