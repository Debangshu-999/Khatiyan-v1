package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalTime;

/**
 * One approved exit and its optional configured schedule.
 *
 * <p>An absent schedule is deliberate: approval never silently creates work.
 */
public record UpcomingTenancyExitResponse(
        TenancyExitRequestResponse request,
        LocalTime executionTime,
        ScheduledTenancyExitResponse schedule) {
}
