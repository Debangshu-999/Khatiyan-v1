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
 * One thing that happened to a request, kept for good and in order. It names
 * who did it, never their details: those stay on the request and the account.
 */
@Entity
@Table(name = "actions", schema = "booking")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BookingRequestAction extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "request_id", nullable = false, updatable = false)
    private UUID requestId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false, length = 30)
    private BookingActionType type;

    /** Null for something the system did, such as an expiry. */
    @Enumerated(EnumType.STRING)
    @Column(updatable = false, length = 12)
    private BookingParty party;

    @Column(name = "actor_user_id", updatable = false)
    private UUID actorUserId;

    @Column(name = "offer_sequence", updatable = false)
    private Integer offerSequence;

    @Enumerated(EnumType.STRING)
    @Column(name = "status_after", nullable = false, updatable = false, length = 20)
    private BookingStatus statusAfter;

    @Column(updatable = false, length = 500)
    private String note;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    /**
     * The order the rows were written in, numbered by the database. Two
     * things done in one step share a time, such as terms agreed and the
     * booking confirmed, and this is what keeps them in order. It is not
     * known until the row is read back.
     */
    @Column(name = "seq", insertable = false, updatable = false)
    private Long seq;

    /** Something a person did. */
    public static BookingRequestAction by(UUID requestId, BookingActionType type, BookingParty party, UUID actorUserId,
            Integer offerSequence, BookingStatus statusAfter, String note, Instant occurredAt) {
        if (party == null || actorUserId == null) {
            throw new IllegalArgumentException("A person's action names the person and their side");
        }
        return create(requestId, type, party, actorUserId, offerSequence, statusAfter, note, occurredAt);
    }

    /** Something a clock did. */
    public static BookingRequestAction bySystem(UUID requestId, BookingActionType type, BookingStatus statusAfter,
            String note, Instant occurredAt) {
        return create(requestId, type, null, null, null, statusAfter, note, occurredAt);
    }

    private static BookingRequestAction create(UUID requestId, BookingActionType type, BookingParty party,
            UUID actorUserId, Integer offerSequence, BookingStatus statusAfter, String note, Instant occurredAt) {
        BookingRequestAction row = new BookingRequestAction();
        row.id = UUID.randomUUID();
        row.requestId = requestId;
        row.type = type;
        row.party = party;
        row.actorUserId = actorUserId;
        row.offerSequence = offerSequence;
        row.statusAfter = statusAfter;
        row.note = note;
        row.occurredAt = occurredAt;
        return row;
    }
}
