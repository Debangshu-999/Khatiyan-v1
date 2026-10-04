import type { ComponentType } from "react";
import type { ImageSourcePropType } from "react-native";

import type { ManagerResource } from "@/store/services/property-api";
import { AlertCircle, Banknote, BriefcaseBusiness, Megaphone, UsersRound, type LucideProps } from "lucide-react-native";

import { PropertyIcon } from "@/components/property-icon";
import { foodIcon } from "@/features/food/food-ui";

export type OwnerModuleKey =
  | "tenancy"
  | "billing"
  | "property"
  | "food"
  | "notice"
  | "concern"
  | "staff";

export type OwnerModuleRoute = string | { pathname: string; params: Record<string, string> };

export type OwnerModule = {
  artwork?: ImageSourcePropType;
  artworkVariant?: "compact" | "large" | "wide";
  key: OwnerModuleKey;
  title: string;
  /** A shorter name for the Pinned Services tile on Home, where the full one is too long. */
  pinnedTitle?: string;
  /**
   * What the module is for and what it holds, in a couple of short sentences
   * that fill two or three lines beside the artwork (user, 2026-10-04). Not a
   * bare comma list of its screens, and not a one-line slogan either: the
   * first version listed everything and the second said too little, leaving
   * agreements out of Tenancy. About 95 to 110 characters. The card grows
   * with it.
   */
  description: string;
  icon: ComponentType<LucideProps>;
  route: OwnerModuleRoute;
  // True for a module no manager may ever open, regardless of grants. Staff is
  // the only one: it holds salaries, employment records and a manager's own pay,
  // so StaffService and SalaryAccountService demand the owner outright. It is a
  // separate flag rather than a resource because it is not grantable at all.
  ownerOnly?: boolean;
  // Every resource this module contains. The card shows if ANY of them is
  // viewable, because a module is "on" when any screen inside it is granted —
  // gating on one representative resource would hide the whole workspace from a
  // manager who holds, say, exit requests but not the stay list.
  //
  // Absent means "not yet enforced": the module stays visible to every manager
  // until its backend checks are converted. Listing resources here before that
  // would hide a section the manager can still reach by other means.
  resources?: ManagerResource[];
};

// Single source of truth for the owner-side workspace modules. Shared by the
// owner screen (service cards + pinning) and the home "Frequently visited"
// section so they never drift apart.
export const OWNER_MODULES: OwnerModule[] = [
  {
    artwork: require("../../../assets/images/workspace/tenancy-module.png"),
    description: "Move tenants in and see them out. Their stays, agreements, rules and exit requests all live here.",
    icon: UsersRound,
    key: "tenancy",
    resources: ["TENANCIES", "TENANCY_CREATE", "EXIT_REQUESTS", "ROOM_CHANGES", "TENANCY_RULES"],
    route: "/owner-tenancy",
    title: "Tenancy",
  },
  {
    artwork: require("../../../assets/images/workspace/billing-module.png"),
    description: "Rent, extra charges and deposits in one place. See what is paid, what is due and what has gone late.",
    icon: Banknote,
    key: "billing",
    resources: ["BILLING_CYCLES", "DEPOSITS"],
    route: "/owner-billing",
    title: "Billing",
  },
  {
    artwork: require("../../../assets/images/workspace/property-module.png"),
    description: "Everything about the place itself. Rooms and beds, your listing, the board and visiting hours.",
    // The property mark, not a spanner. A spanner says "settings", which is one
    // of four things behind this tile — and it is now the Manage tab's own
    // icon, so the module and the tab it lives in were wearing the same glyph.
    icon: PropertyIcon,
    key: "property",
    resources: ["PROPERTY_SETTINGS", "ROOMS", "PROPERTY_BOARD", "NEARBY_PLACES"],
    route: "/owner-property",
    title: "Property",
  },
  {
    artwork: require("../../../assets/images/workspace/food-preference-module-card.png"),
    description: "Set the week's menu and who eats what. Know how many plates to cook before every meal.",
    icon: foodIcon("silverware-fork-knife"),
    key: "food",
    resources: ["FOOD"],
    // "Meals" once pinned (user, 2026-10-04). It was "Food preference".
    pinnedTitle: "Meals",
    route: "/owner-food",
    title: "Meal management",
  },
  {
    artwork: require("../../../assets/icons/workspace/notice-module.png"),
    description: "Tell the whole property at once. Post a notice now, schedule it for later, or set it to repeat.",
    icon: Megaphone,
    key: "notice",
    resources: ["NOTICES"],
    route: "/owner-notices",
    title: "Notice",
  },
  {
    artwork: require("../../../assets/images/workspace/concern-module.png"),
    description: "Everything your tenants raise, from open to resolved. See who has taken each one up and what is stuck.",
    icon: AlertCircle,
    key: "concern",
    resources: ["CONCERNS"],
    route: "/owner-concerns",
    title: "Concern",
  },
  {
    artwork: require("../../../assets/images/workspace/staff-module.png"),
    description: "Your managers and staff in one place. Keep their details, their pay and every salary you have given.",
    icon: BriefcaseBusiness,
    key: "staff",
    ownerOnly: true,
    route: "/owner-staff",
    title: "Staff",
  },
];

/**
 * The modules this user may open. A module with no {@code resource} is not yet
 * permission-gated and is always included.
 */
export function visibleOwnerModules(
  canView: (resource: ManagerResource) => boolean,
  isOwner: boolean,
): OwnerModule[] {
  return OWNER_MODULES.filter((module) => {
    if (module.ownerOnly && !isOwner) {
      return false;
    }
    return !module.resources?.length || module.resources.some((resource) => canView(resource));
  });
}

export function findOwnerModule(key: string): OwnerModule | undefined {
  return OWNER_MODULES.find((module) => module.key === key);
}
