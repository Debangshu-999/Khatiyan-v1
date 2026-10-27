package com.khatiyan.d_modules.booking.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.booking.model.BookingEndCause;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;

/**
 * Every booking token a property has received, and what became of each
 * (user's rule, 2026-10-10): still held for a booking, adjusted against the
 * first rent, kept because the tenant walked away (non refundable), owed back,
 * or waiting on the handler's decision after a no-show. Refunds are not
 * followed (2026-10-28).
 *
 * <p>Only money that arrived is here. A token still owed, or claimed and not
 * yet confirmed, is not money the property has.
 *
 * @param summary totals across every token, not only the page shown
 * @param tokens  newest received first
 */
public record BookingTokenLedgerResponse(Summary summary, PageResponse<Item> tokens) {

    /**
     * @param collectedPaise everything ever received as a token
     * @param heldPaise      received for bookings that are still to start
     * @param adjustedPaise  taken off a first bill when the tenant moved in
     * @param keptPaise      kept because the tenant walked away. Income
     * @param refundDuePaise owed back. The app does not follow the refund
     * @param pendingPaise   a guest did not arrive, and the handler has not
     *                       decided yet
     */
    public record Summary(long count, long collectedPaise, long heldPaise, long adjustedPaise, long keptPaise,
            long refundDuePaise, long pendingPaise) {
    }

    /**
     * @param bookingReferenceCode the booking's short code, never its id
     * @param endCause             why the booking ended, which is why a token
     *                             was kept or owed back
     * @param canDecide            whether the reader may refund or keep it now:
     *                             it waits on a decision, and the booking is
     *                             theirs to act on
     * @param version              the booking's version, sent back with that step
     */
    public record Item(
            UUID requestId,
            String bookingReferenceCode,
            String receiptCode,
            String tenantName,
            String roomNumber,
            LocalDate moveInDate,
            long amountPaise,
            BookingTokenStatus status,
            ManualPaymentMethod receivedMethod,
            String receivedReference,
            Instant receivedAt,
            BookingStatus bookingStatus,
            BookingEndCause endCause,
            Instant refundDueSince,
            boolean canDecide,
            long version) {
    }
}
