package com.khatiyan.d_modules.dashboard.api.dto;

import java.time.Instant;

/**
 * A single entry in the owner dashboard recent-activity feed.
 */
public record RecentActivityItem(
    RecentActivityType type,
    String title,
    String subtitle,
    Instant occurredAt
) {
}
