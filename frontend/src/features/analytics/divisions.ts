import type { AnalyticsDivision } from "@/features/analytics/types";
import type { ManagerResource } from "@/store/services/property-api";

export type DivisionConfig = {
  title: string;
  tail: string;
  tileLabel: string;
  /** A manager may open the screen with ANY of these. The server enforces it too. */
  resources: ManagerResource[];
  /** Card order. The app owns layout, the server only answers. */
  now: string[];
  period: string[];
  /**
   * Topic sections instead of "Right now" and the period, for a division too
   * big to read as two long lists. Cards that follow the period say so on
   * themselves.
   */
  groups?: { title: string; keys: string[] }[];
};

export const DIVISIONS: Record<AnalyticsDivision, DivisionConfig> = {
  billing: {
    now: ["billing.dues", "billing.overdue_ageing", "billing.upi_claims_pending"],
    period: ["billing.collection_rate", "billing.status_mix", "billing.collections_by_mode", "billing.bill_types", "billing.payment_timeliness", "billing.late_fees_discounts"],
    resources: ["BILLING_CYCLES"],
    tail: "insights.",
    tileLabel: "Billing",
    title: "Billing",
  },
  concerns: { now: [], period: [], resources: ["CONCERNS"], tail: "insights.", tileLabel: "Concerns", title: "Concern" },
  finance: {
    now: ["finance.deposits"],
    period: [
      "finance.income_vs_expenses",
      "finance.profit_margin",
      "finance.accrual_vs_cash",
      "finance.per_bed",
      "finance.expense_categories",
      "finance.fixed_vs_variable",
      "finance.budget_vs_actual",
      "finance.top_payees",
      "finance.other_income",
    ],
    resources: ["PNL", "EXPENSES", "DEPOSITS"],
    tail: "insights.",
    tileLabel: "Finance",
    title: "Finance",
  },
  // Agreements live here: three cards were too small for a screen of their own
  // (user decision, 2026-09-26). Grouped by topic, not by now and period.
  tenants: {
    groups: [
      { keys: ["tenants.occupancy", "tenants.room_vacancy", "tenants.stay_type"], title: "Rooms and beds" },
      { keys: ["tenants.moves", "tenants.upcoming_exits", "tenants.tenure", "tenants.profile", "tenants.id_verification"], title: "Tenants" },
      { keys: ["tenants.agreement_status", "tenants.agreement_terms", "tenants.terms_ending", "tenants.time_to_sign"], title: "Agreements" },
      { keys: ["tenants.meal_preferences", "tenants.food_subscriptions"], title: "Food" },
    ],
    now: [],
    period: [],
    resources: ["ROOMS", "TENANCIES", "EXIT_REQUESTS", "FOOD"],
    tail: "insights.",
    // "Tenancy", not "Tenants" (owner's call, 2026-09-27): the division is about
    // stays, rooms, agreements and food, not only the people.
    tileLabel: "Tenancy",
    title: "Tenancy",
  },
};

export function isDivision(value: unknown): value is AnalyticsDivision {
  return typeof value === "string" && value in DIVISIONS;
}

/** A division with no cards yet shows an empty state rather than making an empty request. */
export function divisionReady(division: AnalyticsDivision) {
  const config = DIVISIONS[division];
  return config.now.length + config.period.length + (config.groups?.length ?? 0) > 0;
}
