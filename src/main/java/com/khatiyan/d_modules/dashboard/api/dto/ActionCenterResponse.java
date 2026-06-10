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
    MoneySnapshot money,
    TodayDigest today,
    AttentionSummary attention,
    ConcernQueueSummary concerns,
    List<RecentActivityItem> recentActivity,
    Instant generatedAt
) {
}
