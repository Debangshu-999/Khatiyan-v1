import { ExitTenancyIcon } from "@/components/artwork-icon";
import { BookingTokenAmountIcon } from "@/components/booking-vector-icons";
// The Manage tab's own marks for these modules (user, 2026-10-27): the Bookings calendar, Enquiries and Visits.
import { BookingsIcon, EnquiriesIcon, PropertyVisitsIcon } from "@/features/property/property-control-icons";
import { UpcomingExitsIcon } from "@/components/tenancy-line-icons";
import { AlertCircle, Banknote, BedDouble, CalendarClock, CalendarX2, Check, FileSignature, Gauge, HandCoins, KeyRound, Repeat2, ShieldAlert, TrendingUp, Wallet, type LucideProps } from "lucide-react-native";
import { formatMoneyPaise } from "@/features/owner/owner-ui";
import { formatDate } from "@/features/owner/bill-views";
import { type BlockedBooking, type OwnerDashboard } from "@/store/services/dashboard-api";
import type { ComponentType } from "react";

export type ActionRoute =
  | "/owner-billing"
  | "/owner-concerns"
  | "/owner-deposit-history"
  | "/owner-enquiries"
  | "/owner-exit-requests"
  | "/owner-expenses"
  | "/owner-room-change-requests"
  | "/owner-staff"
  | `/owner-bookings?attention=${string}`
  | "/owner-booking-confirmed"
  | "/owner-booking-tokens?status=DECISION_PENDING"
  | "/owner-payment-claims"
  | "/owner-visits"
  | "/owner-visits-earlier"
  | `/owner-enquiries?attention=${string}`
  | "/owner-tenancy"
  // Opens the tenancy screen with its Upcoming exits sheet already up. The
  // route gate matches on the path alone, so the param does not ungate it.
  | "/owner-tenancy?open=upcoming-exits"
  | "/owner-tenancy?ending=TODAY"
  // Straight to ending the stay that holds a booked bed.
  | `/owner-end-tenancy?tenancyId=${string}`;
export type ActionSource = "billing" | "concern" | "tenancy" | "budget" | "enquiry" | "staff" | "booking" | "visit" | "deposit";
export type ActionFilter = ActionSource | "all";
export type ActionTone = "primary" | "warning" | "danger";

export type ActionItem = {
  count: number;
  badge: string;
  detail: string;
  emphasize: boolean;
  icon: ComponentType<LucideProps>;
  key: string;
  label: string;
  route: ActionRoute;
  source: ActionSource;
  tone: ActionTone;
};

export const ACTION_FILTERS: Array<{ key: ActionFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "booking", label: "Bookings" },
  { key: "visit", label: "Visits" },
  { key: "enquiry", label: "Enquiries" },
  { key: "billing", label: "Billing" },
  { key: "tenancy", label: "Tenancy" },
  { key: "concern", label: "Concerns" },
  { key: "deposit", label: "Deposits" },
  { key: "staff", label: "Staff" },
  { key: "budget", label: "Budget" },
];

const TONE_RANK: Record<ActionTone, number> = { danger: 0, warning: 1, primary: 2 };


export function buildActionItems(dashboard: OwnerDashboard): ActionItem[] {
  const attention = dashboard.attention;
  const items: ActionItem[] = [];

  // One row per booked stay that can't start, each naming its room: the
  // tenant is waiting on something only the owner can do.
  for (const blocked of dashboard.blockedBookings ?? []) {
    const room = blocked.roomNumber ? `Room ${blocked.roomNumber}` : "A room";
    const endStay = blocked.reason !== "ROOM_CHANGE_NOT_DONE" && blocked.blockingTenancyId;
    items.push({
      count: 1,
      badge: formatDate(blocked.startDate),
      detail: blockedBookingDetail(blocked),
      emphasize: true,
      icon: BedDouble,
      key: `booking-blocked-${blocked.bookingTenancyId}`,
      label: `Tenancy can't start · ${room}`,
      route: endStay ? `/owner-end-tenancy?tenancyId=${blocked.blockingTenancyId}` : "/owner-room-change-requests",
      source: "tenancy",
      tone: "danger",
    });
  }

  if (attention.paymentsOverdue > 0) {
    items.push({ count: attention.paymentsOverdue, badge: String(attention.paymentsOverdue), detail: "Awaiting collection", emphasize: true, icon: Banknote, key: "overdue", label: "Overdue payments", route: "/owner-billing", source: "billing", tone: "danger" });
  }

  if (attention.escalatedConcerns > 0) {
    items.push({ count: attention.escalatedConcerns, badge: String(attention.escalatedConcerns), detail: "Needs owner attention", emphasize: true, icon: ShieldAlert, key: "escalated", label: "Escalated concerns", route: "/owner-concerns", source: "concern", tone: "danger" });
  }
  if (attention.concernsUnattended24h > 0) {
    items.push({ count: attention.concernsUnattended24h, badge: String(attention.concernsUnattended24h), detail: "No action in over a day", emphasize: false, icon: AlertCircle, key: "unattended", label: "Concerns unattended 24h+", route: "/owner-concerns", source: "concern", tone: "warning" });
  }

  if (attention.exitsPastDue > 0) {
    items.push({ count: attention.exitsPastDue, badge: String(attention.exitsPastDue), detail: "Checkout date has passed", emphasize: true, icon: CalendarX2, key: "past-due-exits", label: "Exits past due", route: "/owner-tenancy", source: "tenancy", tone: "danger" });
  }
  if ((attention.exitsDueToday ?? 0) > 0) {
    items.push({ count: attention.exitsDueToday ?? 0, badge: String(attention.exitsDueToday), detail: "Ready for checkout", emphasize: false, icon: CalendarClock, key: "due-today-exits", label: "Tenancies ending today", route: "/owner-tenancy?ending=TODAY", source: "tenancy", tone: "warning" });
  }
  if (attention.pendingExitRequests > 0) {
    items.push({ count: attention.pendingExitRequests, badge: String(attention.pendingExitRequests), detail: "Awaiting your review", emphasize: false, icon: ExitTenancyIcon, key: "exits", label: "Pending exit requests", route: "/owner-exit-requests", source: "tenancy", tone: "primary" });
  }
  if (attention.pendingRoomChangeRequests > 0) {
    items.push({ count: attention.pendingRoomChangeRequests, badge: String(attention.pendingRoomChangeRequests), detail: "Awaiting your review", emphasize: false, icon: Repeat2, key: "room-changes", label: "Pending room-change requests", route: "/owner-room-change-requests", source: "tenancy", tone: "primary" });
  }
  if (attention.upcomingExits > 0) {
    items.push({ count: attention.upcomingExits, badge: String(attention.upcomingExits), detail: "Checkout coming up soon", emphasize: false, icon: UpcomingExitsIcon, key: "upcoming", label: "Upcoming exits", route: "/owner-tenancy?open=upcoming-exits", source: "tenancy", tone: "primary" });
  }
  if (attention.tenantsOnNotice > 0) {
    items.push({ count: attention.tenantsOnNotice, badge: String(attention.tenantsOnNotice), detail: "Serving notice period", emphasize: false, icon: KeyRound, key: "notice", label: "Tenants on notice", route: "/owner-tenancy", source: "tenancy", tone: "primary" });
  }
  // A stranger asking about the property, with nobody having answered. Ranked
  // primary rather than danger: nothing is broken, but every hour it sits there
  // is a prospective tenant deciding the place is unresponsive.
  if (!dashboard.enquiries && attention.newEnquiries > 0) {
    items.push({ count: attention.newEnquiries, badge: String(attention.newEnquiries), detail: "Awaiting your response", emphasize: false, icon: EnquiriesIcon, key: "enquiries", label: "Enquiries to answer", route: "/owner-enquiries?attention=RESPONSE", source: "enquiry", tone: "primary" });
  }

  if (attention.pendingDepositSettlements > 0) {
    items.push({ count: attention.pendingDepositSettlements, badge: String(attention.pendingDepositSettlements), detail: "Deposit awaiting settlement", emphasize: false, icon: Wallet, key: "deposit-settlements", label: "Deposits to settle", route: "/owner-deposit-history", source: "deposit", tone: "primary" });
  }

  if (attention.salaryPaymentsDue > 0) {
    items.push({ count: attention.salaryPaymentsDue, badge: String(attention.salaryPaymentsDue), detail: "Unpaid for this month", emphasize: false, icon: HandCoins, key: "salary-due", label: "Salaries to record", route: "/owner-staff", source: "staff", tone: "warning" });
  }

  if (attention.agreementsPendingAcceptance > 0) {
    items.push({ count: attention.agreementsPendingAcceptance, badge: String(attention.agreementsPendingAcceptance), detail: "Waiting on the tenant", emphasize: false, icon: FileSignature, key: "agreements-pending", label: "Agreements unsigned", route: "/owner-tenancy", source: "tenancy", tone: "primary" });
  }

  // Optional-chained: a cached / pre-upgrade dashboard response has no budget.
  const budget = dashboard.budget;
  if (budget?.level === "EXCEEDED") {
    items.push({
      count: 1,
      badge: `+${formatMoneyPaise(budget.overPaise)}`,
      detail: `${formatMoneyPaise(budget.spentPaise)} of ${formatMoneyPaise(budget.effectiveBudgetPaise)}`,
      emphasize: true,
      icon: TrendingUp,
      key: "budget-exceeded",
      label: "Budget exceeded",
      route: "/owner-expenses",
      source: "budget",
      tone: "danger",
    });
  } else if (budget?.level === "APPROACHING") {
    items.push({
      count: 1,
      badge: `${formatMoneyPaise(budget.remainingPaise)} left`,
      detail: `${formatMoneyPaise(budget.spentPaise)} of ${formatMoneyPaise(budget.effectiveBudgetPaise)}`,
      emphasize: false,
      icon: Gauge,
      key: "budget-approaching",
      label: "Budget nearing limit",
      route: "/owner-expenses",
      source: "budget",
      tone: "warning",
    });
  }

  // These are current work queues, never 'new since viewed' badges.
  const add = (key: string, value: number | undefined, label: string, detail: string,
    source: ActionSource, route: ActionRoute, icon: ActionItem["icon"], tone: ActionTone = "primary") => {
    const count = Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : 0;
    if (count > 0) items.push({ key, count, badge: String(count), label, detail, source, route, icon, tone, emphasize: tone === "danger" });
  };
  const booking = dashboard.bookings;
  add("booking-response", booking?.awaitingResponse, "Booking requests to answer", "Accept, counter or cancel the request", "booking", "/owner-bookings?attention=RESPONSE", BookingsIcon);
  add("booking-token-claims", booking?.tokenClaims, "Booking token claims", "Verify the claimed token payment", "booking", "/owner-bookings?attention=TOKEN_CLAIMS", BookingsIcon, "warning");
  add("booking-confirmation", booking?.awaitingConfirmation, "Bookings awaiting confirmation", "Token received, confirm the booking", "booking", "/owner-bookings?attention=CONFIRMATION", BookingsIcon, "warning");
  // Past due only: a move-in day before today, nobody moved in yet. Today's arrivals are not late (user, 2026-10-27).
  add("booking-move-ins", booking?.moveInsDue, "Booked move-ins past due", "Move-in date has passed, onboard them or record they did not arrive", "booking", "/owner-bookings?attention=MOVE_IN", BookingsIcon, "warning");
  // A no-show's token waits on refund or keep (user, 2026-10-28). Refunds owed are not followed, so they are not work here.
  add("booking-token-decisions", booking?.tokenDecisions, "Tokens pending action", "The guest did not arrive, refund or keep the token", "booking", "/owner-booking-tokens?status=DECISION_PENDING", BookingTokenAmountIcon, "warning");
  add("visits-today", dashboard.visits?.arrivalsToday, "Visits to receive today", "Check visitors in when they arrive", "visit", "/owner-visits", PropertyVisitsIcon);
  add("visit-attendance", dashboard.visits?.attendanceOverdue, "Visit attendance not recorded", "Review today's earlier slots before midnight", "visit", "/owner-visits-earlier", PropertyVisitsIcon, "warning");
  add("enquiry-unassigned", dashboard.enquiries?.unassigned, "Enquiries to pick up", "Assign a handler or take up the enquiry", "enquiry", "/owner-enquiries?attention=UNASSIGNED", EnquiriesIcon);
  add("enquiry-response", dashboard.enquiries?.awaitingResponse, "Enquiries to answer", "A handler is assigned, an answer is still due", "enquiry", "/owner-enquiries?attention=RESPONSE", EnquiriesIcon);
  add("enquiry-call-outcomes", dashboard.enquiries?.callsToRecord, "Enquiry call outcomes to record", "Record how the pending call went", "enquiry", "/owner-enquiries?attention=CALLS", EnquiriesIcon, "warning");
  add("payment-claims", dashboard.paymentIntents?.awaitingReview, "Bill payment claims to verify", "Approve or reject the payment claim", "billing", "/owner-payment-claims", Banknote, "warning");
  add("concerns-review", dashboard.concerns?.underReview, "Concerns awaiting review", "Review and move the concern forward", "concern", "/owner-concerns", AlertCircle);
  add("concerns-reopened", dashboard.concerns?.reopened, "Reopened concerns", "The tenant needs another response", "concern", "/owner-concerns", Repeat2, "warning");
  add("concerns-new", Math.max(0, (dashboard.concerns?.open ?? 0) - (attention.concernsUnattended24h ?? 0)), "New concerns to take up", "Assign or start handling the concern", "concern", "/owner-concerns", AlertCircle);

  return items.sort((first, second) => TONE_RANK[first.tone] - TONE_RANK[second.tone]);
}


function blockedBookingDetail(blocked: BlockedBooking): string {
  const name = blocked.blockingTenantName;
  switch (blocked.reason) {
    case "PENDING_EXIT":
      return `Pending exit${name ? ` for ${name}` : ""}. End it to let the new tenant in.`;
    case "STAY_NOT_ENDED":
      return name ? `${name}'s stay hasn't been ended yet` : "The stay in this room hasn't been ended yet";
    case "ROOM_CHANGE_NOT_DONE":
      return `${name ? `${name}'s room change` : "The room change freeing this bed"} hasn't gone through. Retrying hourly.`;
  }
}


/** One source of truth for the Home badge and every service filter. Viewing never changes this count. */
export function countActionItems(items: ActionItem[]): number {
  return items.reduce((total, item) => total + item.count, 0);
}
export function attentionCount(dashboard: OwnerDashboard | undefined): number {
  return dashboard ? countActionItems(buildActionItems(dashboard)) : 0;
}
