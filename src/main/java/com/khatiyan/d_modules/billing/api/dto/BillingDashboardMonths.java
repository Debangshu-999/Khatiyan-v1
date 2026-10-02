package com.khatiyan.d_modules.billing.api.dto;

import java.util.Set;
import java.util.UUID;

/**
 * What the owner dashboard needs from last month and this one, already summed.
 *
 * <p>The dashboard once took every bill of the property to work these out for
 * itself. They are three small questions, and the database answers each without
 * a bill being loaded.
 *
 * @param rentBilledTenancyIds    stays whose rent for this month is already on
 *                                the books, so the dashboard projects rent only
 *                                for the others
 * @param billedLastMonthPaise    bills whose period began last month, cancelled
 *                                ones left out
 * @param collectedLastMonthPaise bills marked paid during last month, whichever
 *                                month they were for
 */
public record BillingDashboardMonths(
        Set<UUID> rentBilledTenancyIds,
        long billedLastMonthPaise,
        long collectedLastMonthPaise) {
}
