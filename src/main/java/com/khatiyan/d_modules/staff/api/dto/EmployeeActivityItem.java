package com.khatiyan.d_modules.staff.api.dto;

import java.time.Instant;

/** One employee lifecycle entry (added/removed) for the recent-activity feed. */
public record EmployeeActivityItem(
    EmployeeActivityType type,
    String name,
    String categoryName,
    Instant occurredAt
) {
}
