package com.khatiyan.d_modules.booking.service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.booking.model.BookingTiming;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.BookingBedHoldResponse;
import com.khatiyan.d_modules.tenancy.api.dto.BookingFutureVacancyResponse;

/**
 * Internal policy/inventory adapter. A request reserves its bed here in the
 * same transaction that creates it, and releases it here when the booking ends
 * unconfirmed. The caller supplies the authenticated eligibility.
 */
@Service
public class BookingInventoryService {
    private final TenancyModule tenancies;
    private final BookingPolicy policy;

    public BookingInventoryService(TenancyModule tenancies, BookingPolicy policy) {
        this.tenancies = tenancies;
        this.policy = policy;
    }

    /**
     * Beds being vacated, inside the default limit on how far ahead a move-in
     * may be.
     *
     * <p>Not for a property's own booking form. An owner sets their own limit,
     * so the form reads {@code tenancies.bookingFutureVacancies} with the
     * dates it shows the tenant. Using this there once hid a bed that could
     * be booked (readiness review, 2026-10-10).
     */
    public List<BookingFutureVacancyResponse> futureVacancies(UUID propertyId) {
        var timing = policy.newRequestTiming();
        return tenancies.bookingFutureVacancies(propertyId, timing.earliestMoveInDate(), timing.latestMoveInDate());
    }

    /** With the default limit on how far ahead a move-in may be. */
    @Transactional
    public BookingBedHoldResponse reserve(UUID bookingId, UUID propertyId, UUID roomId,
            Instant submittedAt, LocalDate moveInDate, UUID exitRequestId) {
        return reserve(bookingId, propertyId, roomId, policy.timingFor(submittedAt), moveInDate, exitRequestId);
    }

    /**
     * One bed for one request. Refused when the room has no bed free, or the
     * bed being vacated is already claimed.
     *
     * @param timing the request's own bounds, which carry the owner's limit as
     *               it stood when the request was sent
     */
    @Transactional
    public BookingBedHoldResponse reserve(UUID bookingId, UUID propertyId, UUID roomId,
            BookingTiming timing, LocalDate moveInDate, UUID exitRequestId) {
        policy.requireMoveInDate(policy.liveMoveInWindow(timing), moveInDate);
        // The inventory facade re-reads the actual confirmed checkout under
        // allocation locks and enforces its strictly-after-exit floor too.
        return tenancies.reserveBookingBed(bookingId, propertyId, roomId, moveInDate, exitRequestId);
    }

    @Transactional
    public boolean release(UUID bookingId, UUID propertyId) {
        return tenancies.releaseBookingBed(bookingId, propertyId);
    }

    /** The booked bed passes to the stay being created in this transaction. Refused while it is still occupied. */
    public void consume(UUID bookingId, UUID propertyId) {
        tenancies.consumeBookingBed(bookingId, propertyId);
    }

    /** Whether the booked bed is free for its person now. False while whoever is leaving it has not gone. */
    /** Of these bookings, the ones whose bed is free for them now. One read for a page (2026-10-27). */
    public java.util.Set<UUID> readyAmong(java.util.Collection<UUID> bookingIds) {
        return tenancies.bookingBedsReady(bookingIds);
    }

    public boolean bedReady(UUID bookingId, UUID propertyId) {
        return tenancies.findBookingBed(bookingId, propertyId).map(hold -> "HELD".equals(hold.state())).orElse(false);
    }

    /** The booking's move-in date moves to a later day. Its bed is kept. */
    public void moveDate(UUID bookingId, UUID propertyId, LocalDate moveInDate) {
        tenancies.moveBookingBedDate(bookingId, propertyId, moveInDate);
    }

    /** The booking takes a bed that is free today in another room, in place of the one it held or waited for. */
    public void moveBed(UUID bookingId, UUID propertyId, UUID roomId) {
        tenancies.moveBookingBed(bookingId, propertyId, roomId);
    }
}
