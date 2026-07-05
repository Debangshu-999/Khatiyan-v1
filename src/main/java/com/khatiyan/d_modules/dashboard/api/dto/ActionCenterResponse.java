package com.khatiyan.d_modules.dashboard.api.dto;

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
    List<RecentActivityItem> recentActivity,
    List<MonthlyTrendPoint> monthlyTrends,
    Instant generatedAt
) {
}
