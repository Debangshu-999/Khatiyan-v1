package com.khatiyan.d_modules.lead.api.dto;

/**
 * How many records a property has at each point of the pipeline.
 *
 * <p>The first four count records still in play. {@code movedIn} counts the
 * ones that converted. {@code closed} counts the ones that ended any other way.
 */
public record LeadCountsResponse(
        long enquired,
        long earlyLead,
        long advancedLead,
        long booked,
        long movedIn,
        long closed) {
}
