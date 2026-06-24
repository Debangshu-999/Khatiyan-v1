import type { ComponentType } from "react";
import { AlertCircle, Banknote, Bell, Compass, Megaphone, UsersRound, Wrench, type LucideProps } from "lucide-react-native";

export type OwnerModuleKey =
  | "tenancy"
  | "billing"
  | "property"
  | "notice"
  | "concern"
  | "discovery"
  | "notifications";

export type OwnerModuleRoute = string | { pathname: string; params: Record<string, string> };

export type OwnerModule = {
  key: OwnerModuleKey;
  title: string;
  description: string;
  icon: ComponentType<LucideProps>;
  route: OwnerModuleRoute;
};

// Single source of truth for the owner-side workspace modules. Shared by the
// owner screen (service cards + pinning) and the home "Frequently visited"
// section so they never drift apart.
export const OWNER_MODULES: OwnerModule[] = [
  {
    description: "Create tenancies, view active stays, review exits and handle room-change requests.",
    icon: UsersRound,
    key: "tenancy",
    route: "/owner-tenancy",
    title: "Tenancy",
  },
  {
    description: "Billing cycles, overdue dues, line items, deposit ledger and payment status.",
    icon: Banknote,
    key: "billing",
    route: "/owner-billing",
    title: "Billing",
  },
  {
    description: "Property settings, room inventory (single & bulk), facilities, board and managers.",
    icon: Wrench,
    key: "property",
    route: "/owner-property",
    title: "Property",
  },
  {
    description: "Property board, visible notices, recurring notices and archive controls.",
    icon: Megaphone,
    key: "notice",
    route: "/owner-notices",
    title: "Notice",
  },
  {
    description: "Available, under review, undertaken, escalated and history views.",
    icon: AlertCircle,
    key: "concern",
    route: "/owner-concerns",
    title: "Concern",
  },
  {
    description: "Listing visibility, description, photos and owner-curated local places.",
    icon: Compass,
    key: "discovery",
    route: { params: { service: "discovery", title: "Discovery" }, pathname: "/owner-service-placeholder" },
    title: "Discovery",
  },
  {
    description: "Owner-side operational alerts and pending action summaries.",
    icon: Bell,
    key: "notifications",
    route: { params: { service: "notifications", title: "Notifications" }, pathname: "/owner-service-placeholder" },
    title: "Notifications",
  },
];

export function findOwnerModule(key: string): OwnerModule | undefined {
  return OWNER_MODULES.find((module) => module.key === key);
}
