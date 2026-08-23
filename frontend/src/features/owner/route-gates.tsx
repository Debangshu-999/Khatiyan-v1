import { useCallback } from "react";

import { useScreenAccessGuard } from "@/features/owner/use-screen-access-guard";
import type { ManagerResource } from "@/store/services/property-api";

/**
 * Owner destinations that need a permission before they open.
 *
 * <p>
 * Home and the action centre both surface numbers a manager may not be allowed
 * to act on — collection totals, overdue counts, deposits awaiting settlement.
 * Those figures stay visible to everyone; only the way IN is gated. So the row
 * renders, and tapping it explains rather than opening a screen that would 403.
 *
 * <p>
 * A route absent from this map is ungated, which is also the state of every
 * module whose backend checks are not converted yet — gating a route before its
 * API enforces anything would be theatre.
 */
export const ROUTE_GATES: Record<string, { label: string; resource: ManagerResource }> = {
  "/owner-billing": { label: "Billing", resource: "BILLING_CYCLES" },
  "/owner-board": { label: "Property board", resource: "PROPERTY_BOARD" },
  "/owner-deposit-history": { label: "Deposits", resource: "DEPOSITS" },
  "/owner-expenses": { label: "Expenses", resource: "EXPENSES" },
  "/owner-deposit-manager": { label: "Deposits", resource: "DEPOSITS" },
  "/owner-local-places": { label: "Nearby places", resource: "NEARBY_PLACES" },
  "/owner-notice-create": { label: "New notice", resource: "NOTICES" },
  "/owner-notice-detail": { label: "Notice", resource: "NOTICES" },
  "/owner-notices": { label: "Notices", resource: "NOTICES" },
  "/owner-payment-history": { label: "Payment history", resource: "BILLING_CYCLES" },
  "/owner-pnl": { label: "Profit & loss", resource: "PNL" },
  "/owner-edit-property": { label: "Edit property", resource: "PROPERTY_SETTINGS" },
  "/owner-property": { label: "Property", resource: "PROPERTY_SETTINGS" },
  "/owner-rooms": { label: "Rooms & beds", resource: "ROOMS" },
  "/owner-tenant-bills": { label: "Tenant bills", resource: "BILLING_CYCLES" },
  "/owner-upcoming-cycles": { label: "Upcoming cycles", resource: "BILLING_CYCLES" },
  "/owner-upcoming-notices": { label: "Upcoming notices", resource: "NOTICES" },
  "/owner-vacancy-finder": { label: "Vacancy finder", resource: "VACANCY_FINDER" },
};

/**
 * Runs {@code open} only if the route is allowed, otherwise explains in a modal.
 * Ungated routes always run.
 *
 * <p>Returns the refusal modal alongside the gate; mount {@code dialog} once in
 * the screen that uses it, or the explanation has nowhere to render.
 */
export function useRouteGate(propertyId: string | null | undefined) {
  const { dialog, guard } = useScreenAccessGuard(propertyId);

  const gate = useCallback(
    (route: string, open: () => void) => {
      // Match on the path alone. A route carrying params ("/x?id=1") would miss
      // an exact-key lookup and fail OPEN — silently ungating the screen.
      const found = ROUTE_GATES[route.split("?")[0]];
      if (!found) {
        open();
        return;
      }
      guard(found.resource, found.label, open);
    },
    [guard],
  );

  return { dialog, gate };
}
