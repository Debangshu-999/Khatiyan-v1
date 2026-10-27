package com.khatiyan.d_modules.booking;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.booking.api.dto.BookingSnapshot;
import com.khatiyan.d_modules.booking.api.dto.BookingAttentionSummary;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;
import com.khatiyan.d_modules.booking.repository.BookingRequestRepository;
import com.khatiyan.d_modules.booking.repository.BookingTokenRepository;

/**
 * What other modules may ask the booking module.
 *
 * <p>Reads, and one write: an external booking (2026-10-19). Otherwise a booking is
 * changed through its own services, by the tenant or the property. The leads pipeline follows bookings from here and from
 * {@code BookingChangedEvent}, and booking never calls it back.
 */
@Service
public class BookingModule {

    private final BookingRequestRepository requests;
    private final Clock clock;
    private final BookingTokenRepository tokens;
    private final com.khatiyan.d_modules.booking.service.BookingExternalService external;

    public BookingModule(BookingRequestRepository requests, Clock clock, BookingTokenRepository tokens,
            com.khatiyan.d_modules.booking.service.BookingExternalService external) {
        this.requests = requests;
        this.clock = clock;
        this.tokens = tokens;
        this.external = external;
    }

    /**
     * The one write through here (2026-10-19): a booking made outside the app,
     * recorded by the property as confirmed. Called by the lead module, which
     * owns the person's external record and moves its lead to Booked in the
     * same transaction.
     *
     * @return the new booking's id
     */
    public UUID createExternalBooking(UUID actorUserId, UUID propertyId, UUID externalProspectId,
            com.khatiyan.d_modules.booking.service.BookingExternalService.Command command) {
        return external.create(actorUserId, propertyId, externalProspectId, command);
    }

    /** What the external booking form opens on: dates, deposit, token rule and the rooms with a bed free. */
    public com.khatiyan.d_modules.booking.service.BookingExternalService.Options externalBookingOptions(
            UUID actorUserId, UUID propertyId) {
        return external.options(actorUserId, propertyId);
    }

    /** A booking as it stands, by id. Empty when there is none. */
    @Transactional(readOnly = true)
    public java.util.Optional<BookingSnapshot> snapshot(UUID requestId) {
        Instant now = clock.instant();
        return requests.findById(requestId).map(request -> BookingSnapshot.of(request, now));
    }

    /** Read-only, property-scoped summary; the dashboard establishes management access first. */
    @Transactional(readOnly = true)
    public BookingAttentionSummary attentionForProperty(UUID propertyId) {
        Instant now = clock.instant();
        var counts = requests.countAttention(propertyId, now,
                now.atZone(java.time.ZoneId.of("Asia/Kolkata")).toLocalDate());
        return new BookingAttentionSummary(counts.getAwaitingResponse(), counts.getTokenClaims(),
                counts.getAwaitingConfirmation(), counts.getMoveInsDue(),
                tokens.countByPropertyIdAndStatus(propertyId, BookingTokenStatus.DECISION_PENDING), counts.getMoveInsToday());
    }

    /**
     * Every booking raised from these enquiries, first to last, each as it
     * stands now. One read however many enquiries are asked about.
     */
    @Transactional(readOnly = true)
    public List<BookingSnapshot> snapshotsForEnquiries(Collection<UUID> enquiryIds) {
        if (enquiryIds.isEmpty()) {
            return List.of();
        }
        Instant now = clock.instant();
        return requests.findByEnquiryIdInOrderBySubmittedAtAsc(enquiryIds).stream()
                .map(request -> BookingSnapshot.of(request, now))
                .toList();
    }
}
