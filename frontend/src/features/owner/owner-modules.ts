import type { ComponentType } from "react";

import type { ManagerResource } from "@/store/services/property-api";
import { AlertCircle, Banknote, BriefcaseBusiness, Megaphone, UsersRound, Wrench, type LucideProps } from "lucide-react-native";

export type OwnerModuleKey =
  | "tenancy"
  | "billing"
  | "property"
  | "notice"
  | "concern"
  | "staff";

export type OwnerModuleRoute = string | { pathname: string; params: Record<string, string> };

export type OwnerModule = {
  key: OwnerModuleKey;
  title: string;
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
    description: "Create tenancies, view active stays, review exits and handle room-change requests.",
    icon: UsersRound,
    key: "tenancy",
    resources: ["TENANCIES", "TENANCY_CREATE", "EXIT_REQUESTS", "ROOM_CHANGES", "TENANCY_RULES"],
    route: "/owner-tenancy",
    title: "Tenancy",
  },
  {
    description: "Billing cycles, overdue dues, line items, deposit ledger and payment status.",
    icon: Banknote,
    key: "billing",
    resources: ["BILLING_CYCLES", "DEPOSITS"],
    route: "/owner-billing",
    title: "Billing",
  },
  {
    description: "Property settings, room inventory (single & bulk), facilities and board.",
    icon: Wrench,
    key: "property",
    resources: ["PROPERTY_SETTINGS", "ROOMS", "PROPERTY_BOARD", "NEARBY_PLACES"],
    route: "/owner-property",
    title: "Property",
  },
  {
    description: "Property board, visible notices, recurring notices and archive controls.",
    icon: Megaphone,
    key: "notice",
    resources: ["NOTICES"],
    route: "/owner-notices",
    title: "Notice",
  },
  {
    description: "Available, under review, undertaken, escalated and history views.",
    icon: AlertCircle,
    key: "concern",
    resources: ["CONCERNS"],
    route: "/owner-concerns",
    title: "Concern",
  },
  {
    description: "Managers, staff categories, employment details and manual salary tracking.",
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
