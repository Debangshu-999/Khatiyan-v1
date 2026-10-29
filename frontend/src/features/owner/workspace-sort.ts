import type { OwnerModule, OwnerModuleKey } from "@/features/owner/owner-modules";
import { buildActionItems, type ActionSource } from "@/features/owner/action-center";
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
 * How many things are waiting on the owner in each module: the Action Center's
 * own items, each counted under the module it opens into (2026-10-28). It used
 * to be a hand-picked sum of a few dashboard counts, so anything left out, a
 * stay ending today, a booking to answer, a token to decide, put no dot on its
 * card and never moved it up the Dynamic order.
 *
 * <p>Only what asks for the owner's action. Upcoming exits, tenants on notice
 * and agreements waiting on the tenant are in the Action Center to inform, and
 * nothing is theirs to do about them. The budget has no card here.
 */
export function pendingByModule(dashboard: OwnerDashboard | undefined): Record<OwnerModuleKey, number> {
  const counts: Record<OwnerModuleKey, number> = { billing: 0, concern: 0, food: 0, notice: 0, property: 0, staff: 0, tenancy: 0 };
  if (!dashboard) return counts;
  for (const item of buildActionItems(dashboard)) {
    if (INFORMATIONAL_ITEMS.has(item.key)) continue;
    const module = MODULE_OF_SOURCE[item.source];
    if (module) counts[module] += item.count;
  }
  return counts;
}

/** Where each kind of Action Center item is handled. Bookings, visits and enquiries live under Property. */
const MODULE_OF_SOURCE: Record<ActionSource, OwnerModuleKey | null> = {
  billing: "billing",
  booking: "property",
  budget: null,
  concern: "concern",
  deposit: "billing",
  enquiry: "property",
  staff: "staff",
  tenancy: "tenancy",
  visit: "property",
};

/** Action Center rows that inform rather than ask: no dot for them. */
const INFORMATIONAL_ITEMS = new Set(["upcoming", "notice", "agreements-pending"]);

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
