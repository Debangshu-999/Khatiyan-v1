package com.khatiyan.d_modules.booking.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A bed the property offers in place of one that is still occupied past the
 * move-in day (user's rule, 2026-10-10). The tenant takes it or does not.
 * Taking it moves the booking to that room at that rent, and the token
 * already received carries over. One offer is on the table at a time.
 */
@Entity
@Table(name = "bed_offers", schema = "booking")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BookingBedOffer extends BaseEntity {

    /** Persisted, so a constant is never removed or renamed. */
    public enum Answer {
        ACCEPTED,
        DECLINED,
        /** The property made a newer offer before the tenant answered this one. */
        REPLACED
    }

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "request_id", nullable = false, updatable = false)
    private UUID requestId;

    @Column(nullable = false, updatable = false)
    private int sequence;

    @Column(name = "room_id", nullable = false, updatable = false)
    private UUID roomId;

    @Column(name = "room_number", nullable = false, updatable = false, length = 40)
    private String roomNumber;

    @Column(name = "monthly_rent_paise", nullable = false, updatable = false)
    private long monthlyRentPaise;

    @Column(name = "offered_by_user_id", nullable = false, updatable = false)
    private UUID offeredByUserId;

    @Column(name = "offered_at", nullable = false, updatable = false)
    private Instant offeredAt;

    /** Null while the tenant has not answered. */
    @Enumerated(EnumType.STRING)
    @Column(length = 15)
    private Answer answer;

    @Column(name = "answered_at")
    private Instant answeredAt;

    public static BookingBedOffer offer(UUID requestId, int sequence, UUID roomId, String roomNumber,
            long monthlyRentPaise, UUID offeredByUserId, Instant offeredAt) {
        BookingBedOffer offer = new BookingBedOffer();
        offer.id = UUID.randomUUID();
        offer.requestId = requestId;
        offer.sequence = sequence;
        offer.roomId = roomId;
        offer.roomNumber = roomNumber;
        offer.monthlyRentPaise = monthlyRentPaise;
        offer.offeredByUserId = offeredByUserId;
        offer.offeredAt = offeredAt;
        return offer;
    }

    public boolean isOpen() {
        return answer == null;
    }

    public void answer(Answer answer, Instant at) {
        if (!isOpen()) {
            throw new IllegalStateException("An offer of another bed is answered once");
        }
        this.answer = answer;
        this.answeredAt = at;
    }
}
