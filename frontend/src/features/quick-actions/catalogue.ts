import type { ComponentType } from "react";
import {
  ArrowLeftRight, BadgeIndianRupee, BedDouble, CalendarCheck, CalendarClock, CalendarPlus, CalendarSearch, CalendarSync, CalendarX,
  CircleCheck,
  ClipboardClock, ClipboardPenLine, ClipboardPlus, CookingPot, DoorOpen, FileCheck2, FilePlus2, FolderPlus, Hammer, HandCoins, HousePlus,
  LayoutGrid, ListPlus, LogOut, Megaphone, MessageCircle, MessagesSquare, MessageSquareReply,
  MessageSquareText, Pencil, Percent, ReceiptIndianRupee, Repeat2, Search,
  ReceiptText, SlidersHorizontal, TrendingUp,
  Undo2, UserCheck, UserCog, UserPlus, UserRoundCheck, UserRoundMinus, Utensils, Wallet, WalletMinimal, Wrench,
  AlarmClock, Archive, BadgeCheck, Banknote, CalendarDays, CalendarFold, CalendarOff, CirclePlay, HandHelping, Repeat, Scale, Shapes,
  ShieldPlus, TimerOff, TriangleAlert, UserRoundPlus, Users,
  type LucideProps,
} from "lucide-react-native";
import type { ManagerPermissions, ManagerResource } from "@/store/services/property-api";
import type { ActionItem } from "@/features/owner/action-center";
import { RupeeBanknoteIcon } from "@/components/rupee-banknote-icon";
import { CalendarArrowRightIcon } from "@/components/calendar-arrow-right-icon";

export const QUICK_ACTION_CATEGORIES = [
  { id: "tenancy", label: "Tenancies" },
  { id: "booking", label: "Bookings" },
  { id: "enquiry", label: "Enquiries" },
  { id: "visit", label: "Visits" },
  { id: "billing", label: "Bills & payments" },
  { id: "deposit", label: "Deposits" },
  { id: "expense", label: "Expenses & budgets" },
  { id: "property", label: "Rooms & property" },
  { id: "notice", label: "Notices & board" },
  { id: "concern", label: "Concerns" },
  { id: "food", label: "Meals" },
  { id: "team", label: "Team & salaries" },
] as const;
export type QuickActionCategory = typeof QUICK_ACTION_CATEGORIES[number]["id"];
export type QuickAction = {
  id: string;
  label: string;
  category: QuickActionCategory;
  icon: ComponentType<LucideProps>;
  pathname: string;
  /** Other screens that perform this same action, never arbitrary Action center destinations. */
  alternatePaths?: string[];
  aliases: string;
  params?: Record<string, string>;
  resource?: ManagerResource;
  alsoView?: ManagerResource[];
  access?: "VIEW" | "MANAGE";
  ownerOnly?: boolean;
};

function group(category: QuickActionCategory, resource: ManagerResource | undefined, entries: Omit<QuickAction, "category" | "resource">[]): QuickAction[] {
  return entries.map((entry) => ({ category, resource, ...entry }));
}

/** One catalogue drives Home, search and the full screen. No business rules live here. */
export const QUICK_ACTIONS: QuickAction[] = [
  ...group("tenancy", "TENANCY_CREATE", [
    { id: "new-tenancy", label: "New tenancy", icon: UserPlus, pathname: "/owner-onboard-tenant", aliases: "create onboard tenant monthly daily stay" },
    { id: "existing-tenancy", label: "Add existing stay", icon: UserRoundCheck, pathname: "/owner-onboard-tenant", aliases: "existing tenant import tenancy already moved in", params: { existing: "true" } },
  ]),
  { id: "booking-onboarding", category: "tenancy", resource: "TENANCY_CREATE", alsoView: ["BOOKINGS"], label: "Move in booking", icon: CalendarArrowRightIcon, pathname: "/owner-booking-onboarding", aliases: "onboard convert confirmed pending booking tenancy" },
  { id: "exit-requests", category: "tenancy", resource: "EXIT_REQUESTS", label: "Review exits", icon: ClipboardClock, pathname: "/owner-exit-requests", aliases: "approve reject exit request notice" },
  { id: "room-changes", category: "tenancy", resource: "ROOM_CHANGES", label: "Room changes", icon: ArrowLeftRight, pathname: "/owner-room-change-requests", aliases: "approve reject transfer tenant room change request" },
  { id: "end-tenancy", category: "tenancy", resource: "TENANCIES", label: "End tenancy", icon: LogOut, pathname: "/owner-tenancy", alternatePaths: ["/owner-end-tenancy"], aliases: "checkout check out move out end stay" },
  ...group("booking", "BOOKINGS", [
    { id: "new-booking", label: "New booking", icon: CalendarPlus, pathname: "/owner-external-booking", aliases: "create external walk in phone reservation" },
    { id: "review-booking", label: "Review booking", icon: CalendarSearch, pathname: "/owner-bookings", params: { attention: "RESPONSE" }, aliases: "accept respond request awaiting handler" },
    { id: "counter-rent", label: "Counter rent", icon: MessagesSquare, pathname: "/owner-bookings", params: { attention: "RESPONSE" }, aliases: "negotiate counter final offer booking price" },
    { id: "verify-token", label: "Verify token", icon: FileCheck2, pathname: "/owner-bookings", params: { attention: "TOKEN_CLAIMS" }, aliases: "payment proof claim token received not received" },
    { id: "record-token", label: "Record token", icon: BadgeIndianRupee, pathname: "/owner-bookings", aliases: "record token receipt received payment" },
    { id: "confirm-booking", label: "Confirm booking", icon: CalendarCheck, pathname: "/owner-bookings", params: { attention: "CONFIRMATION" }, aliases: "final confirmation token received accept booking" },
    { id: "cancel-booking", label: "Cancel booking", icon: CalendarX, pathname: "/owner-bookings", aliases: "cancel reservation withdraw reason" },
    { id: "token-refunds", label: "Token refunds", icon: Undo2, pathname: "/owner-booking-tokens", params: { status: "DECISION_PENDING" }, aliases: "refund keep token no show decision" },
  ]),
  ...group("enquiry", undefined, [
    { id: "reply-enquiry", label: "Reply to enquiry", icon: MessageSquareReply, pathname: "/owner-enquiries", params: { attention: "RESPONSE" }, aliases: "respond answer enquiry inquiry message chat call" },
    { id: "follow-up", label: "Follow up", icon: MessageCircle, pathname: "/owner-enquiries", aliases: "follow up enquiry inquiry call chat" },
    { id: "assign-enquiry", label: "Assign enquiry", icon: UserCog, pathname: "/owner-enquiries", ownerOnly: true, params: { attention: "UNASSIGNED" }, aliases: "assign handler enquiry manager" },
    { id: "schedule-visit", label: "Schedule visit", icon: CalendarDays, pathname: "/owner-enquiries", aliases: "book arrange visit viewing tour enquiry" },
  ]),
  ...group("visit", undefined, [
    { id: "walk-in-visit", label: "Walk-in visit", icon: DoorOpen, pathname: "/owner-external-visit", aliases: "record external visitor walkin phone visit" },
    { id: "attendance", label: "Mark attendance", icon: UserCheck, pathname: "/owner-visits", alternatePaths: ["/owner-visits-earlier"], aliases: "check in scan visitor arrival attendance" },
    { id: "visit-feedback", label: "Visit feedback", icon: ClipboardPenLine, pathname: "/owner-visits-earlier", aliases: "complete visit form feedback interest" },
    { id: "reschedule-visit", label: "Reschedule visit", icon: CalendarClock, pathname: "/owner-enquiries", aliases: "change visiting slot appointment time date" },
    { id: "cancel-visit", label: "Cancel visit", icon: CalendarOff, pathname: "/owner-enquiries", aliases: "cancel appointment visiting slot" },
  ]),
  ...group("billing", "BILLING_CYCLES", [
    { id: "new-bill", label: "One-off bill", icon: ReceiptIndianRupee, pathname: "/owner-tenant-bills", aliases: "raise create one off bill tenant charge" },
    { id: "record-payment", label: "Record payment", icon: RupeeBanknoteIcon, pathname: "/owner-billing", aliases: "rent bill payment cash upi bank transfer receipt" },
    { id: "verify-payment", label: "Verify payment", icon: BadgeCheck, pathname: "/owner-payment-claims", ownerOnly: true, aliases: "verify approve reject bill rent payment claim proof" },
    { id: "discount", label: "Add discount", icon: Percent, pathname: "/owner-billing", aliases: "bill discount rent concession" },
    { id: "extra-charge", label: "Add charge", icon: FilePlus2, pathname: "/owner-billing", aliases: "bill extra charge additional fee" },
    { id: "remove-late-fee", label: "Waive late fee", icon: TimerOff, pathname: "/owner-billing", aliases: "remove waive late fee overdue bill" },
  ]),
  ...group("deposit", "DEPOSITS", [
    { id: "add-deposit", label: "Add to deposit", icon: Wallet, pathname: "/owner-deposit-manager", aliases: "add deposit credit correction adjustment" },
    { id: "deduct-deposit", label: "Deduct deposit", icon: WalletMinimal, pathname: "/owner-deposit-manager", aliases: "deduct debit deposit adjustment" },
    { id: "settle-deposit", label: "Settle deposit", icon: HandCoins, pathname: "/owner-deposit-manager", aliases: "settle refund deposit close account" },
    { id: "close-deposit", label: "Close deposit", icon: Archive, pathname: "/owner-deposit-manager", aliases: "close deposit account settlement" },
  ]),
  ...group("expense", "EXPENSES", [
    { id: "add-expense", label: "Add expense", icon: ReceiptText, pathname: "/owner-expenses", aliases: "create expense spending cost purchase" },
    { id: "recurring-expense", label: "Recurring expense", icon: CalendarSync, pathname: "/owner-expenses", aliases: "add create repeat recurring expense cost subscription" },
    { id: "raise-budget", label: "Raise budget", icon: TrendingUp, pathname: "/owner-expenses", aliases: "increase raise monthly expense budget" },
  ]),
  ...group("property", "ROOMS", [
    { id: "add-room", label: "Add room", icon: HousePlus, pathname: "/owner-add-rooms", aliases: "create new room bed" },
    { id: "bulk-rooms", label: "Bulk add rooms", icon: LayoutGrid, pathname: "/owner-add-rooms", params: { mode: "bulk" }, aliases: "multiple many rooms bulk import" },
    { id: "edit-room", label: "Edit room", icon: Pencil, pathname: "/owner-rooms", aliases: "edit room amenities rent occupancy" },
    { id: "room-maintenance", label: "Room maintenance", icon: Wrench, pathname: "/owner-rooms", aliases: "mark room maintenance unavailable status" },
    { id: "reopen-room", label: "Reopen room", icon: BedDouble, pathname: "/owner-rooms", aliases: "take off remove maintenance activate room" },
  ]),
  { id: "find-vacancy", category: "property", resource: "VACANCY_FINDER", access: "VIEW", label: "Find vacancy", icon: Search, pathname: "/owner-vacancy-finder", aliases: "available empty vacant rooms beds search" },
  { id: "new-room-type", category: "property", resource: "ROOMS", label: "New room type", icon: Shapes, pathname: "/owner-room-types", aliases: "create room type ac non ac occupancy amenities mold" },
  { id: "catalogue-item", category: "property", resource: "TENANCY_RULES", label: "Add catalogue item", icon: ListPlus, pathname: "/owner-exit-policies", aliases: "item catalogue bathroom damage price add item" },
  { id: "record-damage", category: "property", resource: "TENANCY_RULES", label: "Record damage", icon: TriangleAlert, pathname: "/owner-damages", aliases: "damage broken item room tenant charge bill record" },
  { id: "repair-item", category: "property", resource: "TENANCY_RULES", label: "Mark repaired", icon: Hammer, pathname: "/owner-damages", aliases: "damaged item repair replace fix" },
  ...group("notice", "NOTICES", [
    { id: "new-notice", label: "Post notice", icon: Megaphone, pathname: "/owner-notice-create", aliases: "publish create new notice announcement" },
    { id: "schedule-notice", label: "Schedule notice", icon: AlarmClock, pathname: "/owner-notice-create", aliases: "future scheduled notice announcement" },
    { id: "repeat-notice", label: "Repeat notice", icon: Repeat, pathname: "/owner-notice-create", aliases: "recurring daily weekly monthly notice" },
  ]),
  ...group("notice", "PROPERTY_BOARD", [
    { id: "board-item", label: "Add board item", icon: ClipboardPlus, pathname: "/owner-board", aliases: "property board information rules contacts timings item" },
    { id: "board-category", label: "New board category", icon: FolderPlus, pathname: "/owner-board", aliases: "property board add category group" },
  ]),
  ...group("concern", "CONCERNS", [
    { id: "take-concern", label: "Take up concern", icon: HandHelping, pathname: "/owner-concerns", aliases: "take review open issue complaint concern" },
    { id: "assign-concern", label: "Assign concern", icon: Users, pathname: "/owner-concerns", ownerOnly: true, aliases: "assign manager handler concern complaint" },
    { id: "start-concern", label: "Start concern work", icon: CirclePlay, pathname: "/owner-concerns", aliases: "concern complaint in progress start work" },
    { id: "update-concern", label: "Update concern", icon: MessageSquareText, pathname: "/owner-concerns", aliases: "progress status note update concern complaint" },
    { id: "resolve-concern", label: "Resolve concern", icon: CircleCheck, pathname: "/owner-concerns", aliases: "resolve fix close complaint issue concern" },
  ]),
  ...group("food", "FOOD", [
    { id: "edit-menu", label: "Edit menu", icon: Utensils, pathname: "/owner-food", aliases: "weekly menu meals food edit" },
    { id: "add-menu-item", label: "Add menu item", icon: CookingPot, pathname: "/owner-food", aliases: "add food meal menu dish" },
    { id: "meal-quantities", label: "Meal quantities", icon: Scale, pathname: "/owner-food-forecast", aliases: "cooking food forecast quantities portions adjust" },
  ]),
  ...group("team", undefined, [
    { id: "add-manager", label: "Add manager", icon: ShieldPlus, pathname: "/owner-add-manager", ownerOnly: true, aliases: "invite add manager team" },
    { id: "add-staff", label: "Add staff", icon: UserRoundPlus, pathname: "/owner-staff", ownerOnly: true, aliases: "new staff member employee team" },
    { id: "salary-month", label: "Open salary month", icon: CalendarFold, pathname: "/owner-staff", ownerOnly: true, aliases: "payroll salary month open" },
    { id: "pay-salary", label: "Record salary", icon: Banknote, pathname: "/owner-staff", ownerOnly: true, aliases: "pay staff manager salary record payment payroll" },
    { id: "salary-adjustment", label: "Adjust salary", icon: SlidersHorizontal, pathname: "/owner-staff", ownerOnly: true, aliases: "salary addition deduction bonus adjustment payroll" },
    { id: "end-employment", label: "End employment", icon: UserRoundMinus, pathname: "/owner-staff", ownerOnly: true, aliases: "staff employee manager end employment schedule departure" },
  ]),
];

export function findQuickAction(id: unknown): QuickAction | undefined {
  return typeof id === "string" ? QUICK_ACTIONS.find((action) => action.id === id) : undefined;
}

/** Unknown grants never expose a management shortcut. Enquiries and VMS use standing property membership. */
export function permittedQuickActions(permissions: ManagerPermissions | undefined, ownerAccount: boolean): QuickAction[] {
  if (!permissions) return [];
  const owner = ownerAccount && permissions.owner;
  return QUICK_ACTIONS.filter((action) => {
    if (action.ownerOnly && !owner) return false;
    if (owner) return true;
    if (action.alsoView?.some((resource) => permissions.levels[resource] !== "VIEW" && permissions.levels[resource] !== "MANAGE")) return false;
    if (!action.resource) return true;
    const level = permissions.levels[action.resource];
    return action.access === "VIEW" ? level === "VIEW" || level === "MANAGE" : level === "MANAGE";
  });
}

function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

/** At most one letter added, dropped or changed: "deposite", "mantenance" (2026-10-29). */
function withinOneEdit(typed: string, word: string) {
  if (Math.abs(typed.length - word.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < typed.length && j < word.length) {
    if (typed[i] === word[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (typed.length > word.length) i++;
    else if (typed.length < word.length) j++;
    else { i++; j++; }
  }
  return edits + (typed.length - i) + (word.length - j) <= 1;
}

function withinTwoEdits(typed: string, word: string) {
  if (Math.abs(typed.length - word.length) > 2) return false;
  // Levenshtein, stopping as soon as every path is past two.
  let previous = Array.from({ length: word.length + 1 }, (_, j) => j);
  for (let i = 1; i <= typed.length; i++) {
    const current = [i];
    for (let j = 1; j <= word.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (typed[i - 1] === word[j - 1] ? 0 : 1));
    }
    if (Math.min(...current) > 2) return false;
    previous = current;
  }
  return previous[word.length] <= 2;
}

/** A typed word matches when it is in the text, or a word there is one slip away from it. */
function wordMatches(typed: string, haystack: string, words: string[]) {
  if (haystack.includes(typed)) return { exact: true };
  // Short words are too easy to mistake for others: "tent" is not "rent".
  return typed.length >= 5 && words.some((word) => withinOneEdit(typed, word)) ? { exact: false } : null;
}
/** {@code other}: nothing came near the words, so related is the everyday actions, not similar ones. */
export function searchQuickActions(actions: QuickAction[], query: string): { matches: QuickAction[]; related: QuickAction[]; other?: boolean } {
  const needle = normalize(query);
  if (!needle) return { matches: [], related: [] };
  const words = needle.split(" ");
  const ranked = actions.map((action, index) => {
    const label = normalize(action.label);
    const category = QUICK_ACTION_CATEGORIES.find((item) => item.id === action.category)!.label;
    const haystack = normalize(`${action.label} ${action.aliases} ${category}`);
    const hayWords = haystack.split(" ");
    const hits = words.map((word) => wordMatches(word, haystack, hayWords));
    const all = hits.every(Boolean);
    const exact = hits.every((hit) => hit?.exact);
    // Near matches rank below every exact one.
    const score = !all ? 0 : !exact ? 15
      : label === needle ? 100 : label.startsWith(needle) ? 80 : label.includes(needle) ? 60 : 30;
    return { action, index, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  const matches = ranked.map((item) => item.action);
  const matchedIds = new Set(matches.map((action) => action.id));
  if (matches.length) {
    // With results: the rest of the categories they come from.
    const categories = new Set(matches.slice(0, 3).map((action) => action.category));
    return { matches, related: actions.filter((action) => !matchedIds.has(action.id) && categories.has(action.category)).slice(0, 3) };
  }
  // Without: anything sharing a word's start, or a word two slips away (2026-10-29).
  const loose = actions.map((action, index) => {
    const category = QUICK_ACTION_CATEGORIES.find((item) => item.id === action.category)!.label;
    const hayWords = normalize(`${action.label} ${action.aliases} ${category}`).split(" ");
    const score = words.reduce((total, typed) => total + (hayWords.some((word) =>
      (typed.length >= 3 && (word.startsWith(typed.slice(0, 3)))) || (typed.length >= 5 && withinTwoEdits(typed, word))) ? 1 : 0), 0);
    return { action, index, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  if (loose.length) return { matches, related: loose.slice(0, 4).map((item) => item.action) };
  // Nothing near it at all ("ghh"): the everyday actions, so the box always offers somewhere to go.
  const everyday = ["new-tenancy", "record-payment", "new-booking", "add-expense", "add-room", "new-notice"]
    .map((id) => actions.find((action) => action.id === id))
    .filter((action): action is QuickAction => Boolean(action));
  return { matches, other: true, related: (everyday.length ? everyday : actions).slice(0, 4) };
}

export function isQuickActionDestination(action: QuickAction, pathname: string): boolean {
  return pathname === action.pathname || Boolean(action.alternatePaths?.includes(pathname));
}

/** Keep useful queue filters, but never let a dashboard link replace the action's actual workflow. */
export function quickActionRoute(action: QuickAction, propertyId: string, queueRoute?: string) {
  let pathname = action.pathname;
  let context: Record<string, string> = {};
  if (queueRoute) {
    const [queuePath, search = ""] = queueRoute.split("?");
    const query = Object.fromEntries(new URLSearchParams(search));
    if (action.id === "booking-onboarding" && queuePath === "/owner-bookings") {
      // Action center counts late move-ins; Create tenancy > From booking is where they are onboarded.
      context = { tab: query.attention === "MOVE_IN" ? "MISSED" : "TODAY" };
    } else if (isQuickActionDestination(action, queuePath)
      && (queuePath !== "/owner-end-tenancy" || Boolean(query.tenancyId))) {
      pathname = queuePath;
      context = query;
    }
  }
  return { pathname, params: { ...action.params, ...context, propertyId, quickAction: action.id, quickPropertyId: propertyId } };
}

const SUGGESTIONS: Record<string, string> = {
  overdue: "record-payment", escalated: "take-concern", unattended: "take-concern",
  "past-due-exits": "end-tenancy", "due-today-exits": "end-tenancy", exits: "exit-requests",
  "room-changes": "room-changes", upcoming: "end-tenancy", "deposit-settlements": "settle-deposit",
  "salary-due": "pay-salary", "budget-exceeded": "raise-budget", "budget-approaching": "raise-budget",
  enquiries: "reply-enquiry", "enquiry-unassigned": "assign-enquiry", "enquiry-response": "reply-enquiry",
  "enquiry-call-outcomes": "follow-up", "booking-response": "review-booking", "booking-token-claims": "verify-token",
  "booking-confirmation": "confirm-booking", "booking-move-ins": "booking-onboarding", "booking-token-decisions": "token-refunds",
  "visits-today": "attendance", "visit-attendance": "attendance", "payment-claims": "verify-payment",
  "concerns-review": "start-concern", "concerns-reopened": "update-concern", "concerns-new": "take-concern",
};
export type QuickActionSuggestion = { action: QuickAction; count?: number; detail?: string; route?: ActionItem["route"] };
export const QUICK_ACTION_SUGGESTION_LIMIT = 4;
export function suggestedQuickActions(actions: QuickAction[], items: ActionItem[], recent: string[] = []): QuickActionSuggestion[] {
  const suggestions: QuickActionSuggestion[] = [];
  const used = new Set<string>();
  for (const item of items) {
    const id = item.key.startsWith("booking-blocked-")
      ? item.route?.split("?")[0] === "/owner-room-change-requests" ? "room-changes" : "end-tenancy"
      : SUGGESTIONS[item.key];
    const action = actions.find((candidate) => candidate.id === id);
    if (!action || used.has(action.id) || item.count <= 0) continue;
    used.add(action.id);
    suggestions.push({ action, count: item.count, detail: `${item.count} ${item.count === 1 ? "action" : "actions"} waiting`, route: item.route });
    if (suggestions.length === QUICK_ACTION_SUGGESTION_LIMIT) return suggestions;
  }
  // Fill from permitted tools only; restricted workspaces may have fewer than four.
  for (const id of [...recent, "new-tenancy", "new-booking", "add-expense", "walk-in-visit", ...actions.map((action) => action.id)]) {
    const action = actions.find((candidate) => candidate.id === id);
    if (action && !used.has(id)) { used.add(id); suggestions.push({ action }); }
    if (suggestions.length === QUICK_ACTION_SUGGESTION_LIMIT) break;
  }
  return suggestions;
}
