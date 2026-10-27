package com.khatiyan.d_modules.enquiry.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.enquiry.PostVisitBookingWindow;
import com.khatiyan.d_modules.enquiry.model.Enquiry;

/**
 * Visit/window eligibility only; later booking creation also checks cooldowns, duplicates and inventory.
 *
 * <p>The 30 days belong to the visitor who attended. A property closing the
 * enquiry afterwards does not take them away: it declines the requests it
 * does not want. An enquiry closed before any attended visit never had them.
 */
public record PostVisitBookingEligibility(
        UUID enquiryId, UUID propertyId, UUID visitId, LocalDate visitedOn,
        LocalDate windowEndsOn, Instant windowExpiresAt, boolean eligible, String reason) {

    public static PostVisitBookingEligibility of(Enquiry enquiry, Instant now) {
        LocalDate date = enquiry.getBookingVisitDate();
        // A stay booked straight from the property profile needs no visit (user, 2026-10-17).
        boolean direct = date == null && enquiry.getDirectBookingAt() != null;
        String reason = enquiry.getBookingWindowClosedAt() != null ? "BOOKING_WINDOW_CLOSED"
                : enquiry.getReplacedAt() != null || (date == null && !direct && enquiry.isEnded()) ? "ENQUIRY_CLOSED"
                : date == null && !direct ? "ATTENDED_VISIT_REQUIRED"
                : !direct && now.atZone(PostVisitBookingWindow.ZONE).toLocalDate().isBefore(date) ? "VISIT_NOT_YET_ATTENDED"
                : enquiry.isExpired(now) ? "BOOKING_WINDOW_EXPIRED" : null;
        LocalDate endsOn = date != null ? PostVisitBookingWindow.endsOn(date)
                : direct ? enquiry.getExpiresAt().minusSeconds(1).atZone(PostVisitBookingWindow.ZONE).toLocalDate() : null;
        Instant expiresAt = date != null ? PostVisitBookingWindow.expiresAt(date) : direct ? enquiry.getExpiresAt() : null;
        return new PostVisitBookingEligibility(enquiry.getId(), enquiry.getPropertyId(),
                enquiry.getBookingVisitId(), date, endsOn, expiresAt, reason == null, reason);
    }
}
