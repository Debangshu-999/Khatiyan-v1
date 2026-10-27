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
 * One rent offer made on a request, kept for good. A counter adds a row and
 * never changes an earlier one, so what each side said stays what they said.
 */
@Entity
@Table(name = "offers", schema = "booking")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BookingRequestOffer extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "request_id", nullable = false, updatable = false)
    private UUID requestId;

    @Column(nullable = false, updatable = false)
    private int sequence;

    @Enumerated(EnumType.STRING)
    @Column(name = "made_by", nullable = false, updatable = false, length = 12)
    private BookingParty madeBy;

    @Column(name = "actor_user_id", nullable = false, updatable = false)
    private UUID actorUserId;

    @Column(name = "monthly_rent_paise", nullable = false, updatable = false)
    private long monthlyRentPaise;

    @Column(nullable = false, updatable = false)
    private boolean negotiable;

    @Column(name = "made_at", nullable = false, updatable = false)
    private Instant madeAt;

    public static BookingRequestOffer of(UUID requestId, int sequence, BookingOffer offer, UUID actorUserId, Instant madeAt) {
        BookingRequestOffer row = new BookingRequestOffer();
        row.id = UUID.randomUUID();
        row.requestId = requestId;
        row.sequence = sequence;
        row.madeBy = offer.madeBy();
        row.actorUserId = actorUserId;
        row.monthlyRentPaise = offer.monthlyRentPaise();
        row.negotiable = offer.negotiable();
        row.madeAt = madeAt;
        return row;
    }
}
