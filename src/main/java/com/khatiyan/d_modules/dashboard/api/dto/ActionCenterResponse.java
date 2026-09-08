package com.khatiyan.d_modules.dashboard.api.dto;

import com.khatiyan.d_modules.billing.api.dto.PaymentIntentDigestResponse;
import java.time.Instant;
import java.util.List;

/**
 * Composite owner action center for a single property. Aggregates read-only
 * snapshots across the property, tenancy, billing, concern, and notice modules.
 */
public record ActionCenterResponse(
    ActionCenterProperty property,
    OccupancySnapshot occupancy,
    TenancySnapshot tenancy,
    MoneySnapshot money,
    TodayDigest today,
    AttentionSummary attention,
    BudgetAttention budget,
    ConcernQueueSummary concerns,

    /**
     * UPI payment claims waiting on the owner — the Live digest tile.
     *
     * <p>Its own block rather than another count on {@code attention}: the tile
     * shows three figures, and the action centre's summary is a list of single
     * numbers.
     */
    PaymentIntentDigestResponse paymentIntents,
    List<RecentActivityItem> recentActivity,
    List<MonthlyTrendPoint> monthlyTrends,
    Instant generatedAt
) {
}
