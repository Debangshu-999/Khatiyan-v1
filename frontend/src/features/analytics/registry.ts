import type { ComponentType } from "react";

import {
  BillTypesCard,
  CollectionRateCard,
  CollectionsByModeCard,
  DuesCard,
  FeesCard,
  OverdueAgeingCard,
  StatusMixCard,
  TimelinessCard,
  UpiClaimsCard,
} from "@/features/analytics/cards/billing-cards";
import {
  AccrualVsCashCard,
  BudgetCard,
  DepositsCard,
  ExpenseCategoriesCard,
  FixedVariableCard,
  IncomeVsExpensesCard,
  OtherIncomeCard,
  PerBedCard,
  ProfitMarginCard,
  TopPayeesCard,
} from "@/features/analytics/cards/finance-cards";
import {
  AgreementStatusCard,
  AgreementTermsCard,
  FoodSubscriptionsCard,
  IdVerificationCard,
  MealPreferencesCard,
  MovesCard,
  OccupancyCard,
  ProfileCard,
  RoomVacancyCard,
  StayTypeCard,
  TenureCard,
  TermsEndingCard,
  TimeToSignCard,
  UpcomingExitsCard,
} from "@/features/analytics/cards/tenants-cards";
import type { MetricResult, PeriodResponse } from "@/features/analytics/types";

export type CardProps = {
  metric: MetricResult;
  /** Every metric in the response, for cards that fold a companion into themselves. */
  metrics: Map<string, MetricResult>;
  onRetry: () => void;
  /** "Apr – Jun 2026" style text for deltas, or null when there is no comparison. */
  compareLabel: string | null;
  /** The period as the server resolved it: trend cards read its bucket size for their axis labels. */
  period: PeriodResponse;
};

/** Metric key → card. A key the app does not know is skipped with a dev warning, so an old app never crashes on a new metric. */
export const CARD_REGISTRY: Record<string, ComponentType<CardProps>> = {
  "billing.bill_types": BillTypesCard,
  "billing.collection_rate": CollectionRateCard,
  "billing.collections_by_mode": CollectionsByModeCard,
  "billing.dues": DuesCard,
  "billing.late_fees_discounts": FeesCard,
  "billing.overdue_ageing": OverdueAgeingCard,
  "billing.payment_timeliness": TimelinessCard,
  "billing.status_mix": StatusMixCard,
  "billing.upi_claims_pending": UpiClaimsCard,
  "finance.accrual_vs_cash": AccrualVsCashCard,
  "finance.budget_vs_actual": BudgetCard,
  "finance.deposits": DepositsCard,
  "finance.expense_categories": ExpenseCategoriesCard,
  "finance.fixed_vs_variable": FixedVariableCard,
  "finance.income_vs_expenses": IncomeVsExpensesCard,
  "finance.other_income": OtherIncomeCard,
  "finance.per_bed": PerBedCard,
  "finance.profit_margin": ProfitMarginCard,
  "finance.top_payees": TopPayeesCard,
  "tenants.agreement_status": AgreementStatusCard,
  "tenants.agreement_terms": AgreementTermsCard,
  "tenants.food_subscriptions": FoodSubscriptionsCard,
  "tenants.id_verification": IdVerificationCard,
  "tenants.meal_preferences": MealPreferencesCard,
  "tenants.moves": MovesCard,
  "tenants.occupancy": OccupancyCard,
  "tenants.profile": ProfileCard,
  "tenants.room_vacancy": RoomVacancyCard,
  "tenants.stay_type": StayTypeCard,
  "tenants.tenure": TenureCard,
  "tenants.terms_ending": TermsEndingCard,
  "tenants.time_to_sign": TimeToSignCard,
  "tenants.upcoming_exits": UpcomingExitsCard,
};

/** Keys rendered INSIDE another card, never on their own. */
export const COMPANION_KEYS = new Set<string>(["billing.one_off_reasons"]);
