import { MEAL_LABEL, formatMealTime } from "@/features/food/food-ui";
import { formatMoneyPaise } from "@/features/owner/owner-ui";
import { stayOutShortDay } from "@/features/tenancy/stay-out-ui";
import type { BillingCycle } from "@/store/services/billing-api";
import type { ConcernSummary } from "@/store/services/concern-api";
import type { MealSlot } from "@/store/services/food-api";
import type { NotificationItem } from "@/store/services/notification-api";
import type { StayOut } from "@/store/services/stay-out-api";

/** What a status line item is about, which picks its icon. */
export type TenantStatusKind = "bill" | "meal" | "stay-out" | "concern" | "notice" | "notification" | "calm" | "roll-call";

export type TenantStatusItem = {
  key: string;
  kind: TenantStatusKind;
  text: string;
  /** Where a tap goes. Null for the calm line. */
  route: string | null;
  /** Shown first, in the danger colour. */
  urgent: boolean;
};

export type TenantStatusSources = {
  /** Today in IST, "YYYY-MM-DD". */
  today: string;
  /** Now, for the 48 hour notification window. */
  now: number;
  propertyName: string | null;
  bills: BillingCycle[];
  nextMeal: MealSlot | null;
  stayOuts: StayOut[];
  concerns: ConcernSummary[];
  noticeCount: number;
  notifications: NotificationItem[];
  /** Tonight's roll call (user, 2026-11-15): "Mark your attendance" leads while it waits for them. */
  rollCall?: { available: boolean; open: boolean; state: string } | null;
  /** The tenant's meal pass (user, 2026-11-15): "Meal pass is active for Lunch" while it is open. */
  mealPass?: { state: string; mealType: MealSlot["mealType"] } | null;
};

const NOTIFICATION_WINDOW_MS = 48 * 60 * 60 * 1000;
const MAX_NOTIFICATION_LINES = 3;

/**
 * The lines the tenant's Home status bar cycles through (user, 2026-11-10):
 * everything pending or coming up, the urgent first, then the rest. Nothing to
 * say gives one calm line. Worked out from what Home already loads.
 */
export function buildTenantStatusItems(sources: TenantStatusSources): TenantStatusItem[] {
  const urgent: TenantStatusItem[] = [];
  const rest: TenantStatusItem[] = [];

  // First while the window is open and nothing is marked yet. Not in red: it is a request, not a debt.
  const roll = sources.rollCall;
  if (roll?.available && roll.open && roll.state === "NOT_MARKED") {
    urgent.push({ key: "roll-call", kind: "roll-call", route: null, text: "Mark your attendance", urgent: false });
  }

  const overdue = sources.bills.filter((bill) => bill.status === "OVERDUE");
  if (overdue.length > 0) {
    const total = overdue.reduce((sum, bill) => sum + bill.totalAmountPaise, 0);
    urgent.push({
      key: "bills-overdue",
      kind: "bill",
      route: "/tenancy-bills",
      text: overdue.length === 1
        ? `A bill of ${formatMoneyPaise(total)} is overdue`
        : `${overdue.length} bills overdue, ${formatMoneyPaise(total)}`,
      urgent: true,
    });
  }

  // An open meal pass says so, in place of the "being served" line for the same meal.
  const pass = sources.mealPass;
  if (pass?.state === "OPEN") {
    urgent.push({ key: "meal-pass", kind: "meal", route: null, text: `Meal pass is active for ${MEAL_LABEL[pass.mealType]}`, urgent: false });
  }

  const meal = sources.nextMeal;
  if (meal?.status === "SERVING" && !(pass?.state === "OPEN" && pass.mealType === meal.mealType)) {
    urgent.push({
      key: "meal-serving",
      kind: "meal",
      route: "/tenancy-food",
      text: `${MEAL_LABEL[meal.mealType]} is being served till ${formatMealTime(meal.endTime)}`,
      urgent: false,
    });
  }

  const away = sources.stayOuts.find((stay) => stay.state === "AWAY");
  if (away) {
    urgent.push({
      key: `stay-away-${away.id}`,
      kind: "stay-out",
      route: "/tenancy-stay-outs",
      text: away.returnDate === sources.today ? "You are back today" : `You are away, back on ${stayOutShortDay(away.returnDate)}`,
      urgent: false,
    });
  }

  const unpaid = sources.bills
    .filter((bill) => bill.status === "UNPAID")
    .sort((a, b) => a.rentDueDate.localeCompare(b.rentDueDate));
  if (unpaid.length === 1) {
    const bill = unpaid[0];
    rest.push({
      key: "bills-unpaid",
      kind: "bill",
      route: "/tenancy-bills",
      text: bill.rentDueDate === sources.today
        ? `${formatMoneyPaise(bill.totalAmountPaise)} due today`
        : `${formatMoneyPaise(bill.totalAmountPaise)} due on ${stayOutShortDay(bill.rentDueDate)}`,
      urgent: false,
    });
  } else if (unpaid.length > 1) {
    rest.push({ key: "bills-unpaid", kind: "bill", route: "/tenancy-bills", text: `${unpaid.length} bills to pay`, urgent: false });
  }

  if (meal && meal.status === "UPCOMING") {
    rest.push({
      key: "meal-next",
      kind: "meal",
      route: "/tenancy-food",
      text: meal.delayMinutes > 0
        ? `${MEAL_LABEL[meal.mealType]} is running ${meal.delayMinutes} min late`
        : `${MEAL_LABEL[meal.mealType]} at ${formatMealTime(meal.startTime)}`,
      urgent: false,
    });
  }

  const nextStay = sources.stayOuts
    .filter((stay) => stay.state === "UPCOMING")
    .sort((a, b) => a.leaveDate.localeCompare(b.leaveDate))[0];
  if (nextStay) {
    rest.push({
      key: `stay-next-${nextStay.id}`,
      kind: "stay-out",
      route: "/tenancy-stay-outs",
      text: nextStay.leaveDate === sources.today ? "Your stay out starts today" : `Stay out from ${stayOutShortDay(nextStay.leaveDate)}`,
      urgent: false,
    });
  }

  const openConcerns = sources.concerns.filter((concern) => concern.status !== "RESOLVED" && concern.status !== "CLOSED");
  if (openConcerns.length > 0) {
    const working = openConcerns.filter((concern) => concern.status === "IN_PROGRESS").length;
    rest.push({
      key: "concerns",
      kind: "concern",
      route: "/concerns",
      text: working > 0
        ? `${working} ${working === 1 ? "concern is" : "concerns are"} being worked on`
        : `${openConcerns.length} open ${openConcerns.length === 1 ? "concern" : "concerns"}`,
      urgent: false,
    });
  }

  if (sources.noticeCount > 0) {
    rest.push({
      key: "notices",
      kind: "notice",
      route: "/property-notices",
      text: `${sources.noticeCount} ${sources.noticeCount === 1 ? "notice" : "notices"} on the board`,
      urgent: false,
    });
  }

  // Unread from the last 48 hours, newest first, one line each.
  sources.notifications
    .filter((item) => !item.readAt && !item.archivedAt && sources.now - Date.parse(item.createdAt) <= NOTIFICATION_WINDOW_MS)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_NOTIFICATION_LINES)
    .forEach((item) => {
      rest.push({ key: `notification-${item.recipientId}`, kind: "notification", route: "/notifications", text: item.title, urgent: false });
    });

  const items = [...urgent, ...rest];
  if (items.length > 0) return items;
  return [{
    key: "calm",
    kind: "calm",
    route: null,
    text: sources.propertyName ? `All good at ${sources.propertyName}` : "All good today",
    urgent: false,
  }];
}

/** Today's date in IST, "YYYY-MM-DD" (the app's day is India's, not the phone's). */
export function todayInIndia(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Asia/Kolkata", year: "numeric" }).format(now);
}
