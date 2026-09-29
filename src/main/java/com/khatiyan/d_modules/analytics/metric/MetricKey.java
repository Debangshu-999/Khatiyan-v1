package com.khatiyan.d_modules.analytics.metric;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import com.khatiyan.d_modules.property.model.ManagerAccessLevel;
import com.khatiyan.d_modules.property.model.ManagerResource;

/**
 * Every metric the analytics screens can show, with what it takes to see it.
 *
 * <p>The string key is the contract with the app and the AI. The constant name
 * is Java's alone. The Concerns phase adds its keys here.
 */
public enum MetricKey {

    BILLING_DUES("billing.dues", AnalyticsDivision.BILLING, MetricScope.NOW, false, ManagerResource.BILLING_CYCLES),
    BILLING_OVERDUE_AGEING("billing.overdue_ageing", AnalyticsDivision.BILLING, MetricScope.NOW, false, ManagerResource.BILLING_CYCLES),
    /** Owner only, like the claims screen: a claim is checked against the owner's own bank statement. */
    BILLING_UPI_CLAIMS_PENDING("billing.upi_claims_pending", AnalyticsDivision.BILLING, MetricScope.NOW, true, ManagerResource.BILLING_CYCLES),
    BILLING_COLLECTION_RATE("billing.collection_rate", AnalyticsDivision.BILLING, MetricScope.PERIOD, false, ManagerResource.BILLING_CYCLES),
    BILLING_STATUS_MIX("billing.status_mix", AnalyticsDivision.BILLING, MetricScope.PERIOD, false, ManagerResource.BILLING_CYCLES),
    BILLING_COLLECTIONS_BY_MODE("billing.collections_by_mode", AnalyticsDivision.BILLING, MetricScope.PERIOD, false, ManagerResource.BILLING_CYCLES),
    BILLING_BILL_TYPES("billing.bill_types", AnalyticsDivision.BILLING, MetricScope.PERIOD, false, ManagerResource.BILLING_CYCLES),
    /** Rendered inside the bill-types card, never as a card of its own. */
    BILLING_ONE_OFF_REASONS("billing.one_off_reasons", AnalyticsDivision.BILLING, MetricScope.PERIOD, false, ManagerResource.BILLING_CYCLES),
    BILLING_PAYMENT_TIMELINESS("billing.payment_timeliness", AnalyticsDivision.BILLING, MetricScope.PERIOD, false, ManagerResource.BILLING_CYCLES),
    BILLING_LATE_FEES_DISCOUNTS("billing.late_fees_discounts", AnalyticsDivision.BILLING, MetricScope.PERIOD, false, ManagerResource.BILLING_CYCLES),

    FINANCE_INCOME_VS_EXPENSES("finance.income_vs_expenses", AnalyticsDivision.FINANCE, MetricScope.PERIOD, false, ManagerResource.PNL),
    FINANCE_PROFIT_MARGIN("finance.profit_margin", AnalyticsDivision.FINANCE, MetricScope.PERIOD, false, ManagerResource.PNL),
    FINANCE_ACCRUAL_VS_CASH("finance.accrual_vs_cash", AnalyticsDivision.FINANCE, MetricScope.PERIOD, false, ManagerResource.PNL),
    /** Needs both: the money is P&L, the occupied beds are tenancies. */
    FINANCE_PER_BED("finance.per_bed", AnalyticsDivision.FINANCE, MetricScope.PERIOD, false, ManagerResource.PNL, ManagerResource.TENANCIES),
    FINANCE_EXPENSE_CATEGORIES("finance.expense_categories", AnalyticsDivision.FINANCE, MetricScope.PERIOD, false, ManagerResource.EXPENSES),
    FINANCE_BUDGET_VS_ACTUAL("finance.budget_vs_actual", AnalyticsDivision.FINANCE, MetricScope.PERIOD, false, ManagerResource.EXPENSES),
    FINANCE_FIXED_VS_VARIABLE("finance.fixed_vs_variable", AnalyticsDivision.FINANCE, MetricScope.PERIOD, false, ManagerResource.EXPENSES),
    FINANCE_TOP_PAYEES("finance.top_payees", AnalyticsDivision.FINANCE, MetricScope.PERIOD, false, ManagerResource.EXPENSES),
    FINANCE_OTHER_INCOME("finance.other_income", AnalyticsDivision.FINANCE, MetricScope.PERIOD, false, ManagerResource.PNL),
    FINANCE_DEPOSITS("finance.deposits", AnalyticsDivision.FINANCE, MetricScope.NOW, false, ManagerResource.DEPOSITS),

    /** Beds now, and the occupancy rate over the period from stay records (user decision 2026-09-26: one card, not two). */
    TENANTS_OCCUPANCY("tenants.occupancy", AnalyticsDivision.TENANTS, MetricScope.PERIOD, false, ManagerResource.ROOMS),
    /** Rooms, not beds, since beds are not tracked one by one. Joins rooms (property) with move-outs (tenancy), so it needs both. */
    TENANTS_ROOM_VACANCY("tenants.room_vacancy", AnalyticsDivision.TENANTS, MetricScope.NOW, false, ManagerResource.ROOMS, ManagerResource.TENANCIES),
    TENANTS_UPCOMING_EXITS("tenants.upcoming_exits", AnalyticsDivision.TENANTS, MetricScope.NOW, false, ManagerResource.EXIT_REQUESTS),
    TENANTS_TENURE("tenants.tenure", AnalyticsDivision.TENANTS, MetricScope.NOW, false, ManagerResource.TENANCIES),
    /** Stays now, and stays per bucket over the period. */
    TENANTS_STAY_TYPE("tenants.stay_type", AnalyticsDivision.TENANTS, MetricScope.PERIOD, false, ManagerResource.TENANCIES),
    TENANTS_ID_VERIFICATION("tenants.id_verification", AnalyticsDivision.TENANTS, MetricScope.NOW, false, ManagerResource.TENANCIES),
    TENANTS_PROFILE("tenants.profile", AnalyticsDivision.TENANTS, MetricScope.NOW, false, ManagerResource.TENANCIES),
    /** Left out of the response entirely when food is off for the property. */
    TENANTS_MEAL_PREFERENCES("tenants.meal_preferences", AnalyticsDivision.TENANTS, MetricScope.NOW, false, ManagerResource.FOOD),
    /** Agreements live in Tenants: spec #33–35, folded in by user decision. */
    TENANTS_AGREEMENT_STATUS("tenants.agreement_status", AnalyticsDivision.TENANTS, MetricScope.NOW, false, ManagerResource.TENANCIES),
    /** Live stays on a fixed term (an agreement end date) against indefinite ones (user request, 2026-09-26). */
    TENANTS_AGREEMENT_TERMS("tenants.agreement_terms", AnalyticsDivision.TENANTS, MetricScope.NOW, false, ManagerResource.TENANCIES),
    TENANTS_TERMS_ENDING("tenants.terms_ending", AnalyticsDivision.TENANTS, MetricScope.NOW, false, ManagerResource.TENANCIES),
    TENANTS_MOVES("tenants.moves", AnalyticsDivision.TENANTS, MetricScope.PERIOD, false, ManagerResource.TENANCIES),
    TENANTS_TIME_TO_SIGN("tenants.time_to_sign", AnalyticsDivision.TENANTS, MetricScope.PERIOD, false, ManagerResource.TENANCIES),
    /** Left out of the response entirely when food is off for the property. */
    TENANTS_FOOD_SUBSCRIPTIONS("tenants.food_subscriptions", AnalyticsDivision.TENANTS, MetricScope.PERIOD, false, ManagerResource.FOOD);

    private final String key;
    private final AnalyticsDivision division;
    private final MetricScope scope;
    private final boolean ownerOnly;
    private final Set<ManagerResource> resources;

    MetricKey(String key, AnalyticsDivision division, MetricScope scope, boolean ownerOnly, ManagerResource... resources) {
        this.key = key;
        this.division = division;
        this.scope = scope;
        this.ownerOnly = ownerOnly;
        this.resources = Set.of(resources);
    }

    public String key() {
        return key;
    }

    public AnalyticsDivision division() {
        return division;
    }

    public MetricScope scope() {
        return scope;
    }

    /** Owners see everything. A manager needs view access to EVERY resource listed, and never an owner-only one. */
    public boolean visibleTo(boolean owner, Map<ManagerResource, ManagerAccessLevel> levels) {
        if (owner) {
            return true;
        }
        if (ownerOnly) {
            return false;
        }
        return resources.stream().allMatch(resource -> levels.getOrDefault(resource, ManagerAccessLevel.NONE).canView());
    }

    public static EnumSet<MetricKey> visibleIn(
            AnalyticsDivision division, boolean owner, Map<ManagerResource, ManagerAccessLevel> levels) {
        EnumSet<MetricKey> visible = EnumSet.noneOf(MetricKey.class);
        for (MetricKey key : values()) {
            if (key.division == division && key.visibleTo(owner, levels)) {
                visible.add(key);
            }
        }
        return visible;
    }
}
