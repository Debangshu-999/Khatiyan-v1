package com.khatiyan.d_modules.lead.api.dto;

/**
 * How many records a property has of each kind, as of now.
 *
 * <p>{@code enquiries} to {@code booked} count records still in play.
 * {@code converted} counts the ones that moved in, {@code dead} the leads that
 * ended any other way, and {@code lostEnquiries} the records that closed
 * without ever having a visit scheduled.
 *
 * @param duplicates    leads in play opened after the person walked away from
 *                      one or two earlier records here. Counted under their
 *                      kind as well
 * @param potentialSpam leads in play opened after three or more. Counted under
 *                      their kind as well
 * @param resumed   leads in play whose person came back after an earlier
 *                  record here ended, or whose record was opened again
 * @param goingCold leads in play with something running out soon or waiting
 *                  on the property
 */
public record LeadCountsResponse(
        long enquiries,
        long earlyLeads,
        long advancedLeads,
        long booked,
        long converted,
        long dead,
        long lostEnquiries,
        long duplicates,
        long potentialSpam,
        long resumed,
        long goingCold) {
}
