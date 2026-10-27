package com.khatiyan.d_modules.lead.api.dto;

import java.util.List;

import com.khatiyan.d_modules.lead.model.LeadCloseReason;
import com.khatiyan.d_modules.lead.model.LeadStage;

/**
 * A property's pipeline for one month (user, 2026-10-11).
 *
 * <p>Each step is counted in the month it happened, in IST, so a visit booked
 * in September and attended in October is one visit scheduled in September and
 * one attended in October. The steps are not one group of people followed
 * through, and a later step can be larger than an earlier one.
 *
 * <p>Records the owner set aside as spam or a duplicate are in none of it.
 *
 * @param month                       {@code 2026-10}
 * @param enquiriesAnswered           first successful responses made in the month
 * @param firstResponseMedianSeconds  from the enquiry to that first response,
 *                                    for the ones answered in the month. Null when none were
 * @param firstResponseP90Seconds     nine in ten were answered within this
 * @param deadLeads                   leads that ended in the month without a
 *                                    move-in, by the stage they died at and why
 * @param lostEnquiries               records that closed in the month without
 *                                    ever having a visit scheduled, by why
 * @param resumedLeads                people who came back in the month
 * @param resumedConverted            how many of those have moved in since
 * @param goingCold                   as of now, whatever the month asked for
 */
public record LeadFunnelResponse(
        String month,
        long enquiriesRaised,
        long enquiriesAnswered,
        Long firstResponseMedianSeconds,
        Long firstResponseP90Seconds,
        long visitsScheduled,
        long visitsAttended,
        long visitsMissed,
        long bookingRequests,
        long bookingsConfirmed,
        long moveIns,
        List<DeadLeads> deadLeads,
        List<LostEnquiries> lostEnquiries,
        long resumedLeads,
        long resumedConverted,
        long goingCold) {

    public record DeadLeads(LeadStage stage, LeadCloseReason reason, long total) {
    }

    public record LostEnquiries(LeadCloseReason reason, long total) {
    }
}
