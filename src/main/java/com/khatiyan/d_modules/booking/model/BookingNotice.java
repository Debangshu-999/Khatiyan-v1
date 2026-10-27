package com.khatiyan.d_modules.booking.model;

import java.time.Instant;
import java.time.LocalDate;
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
 * Something a booking has already told people, kept so it is never said
 * twice. One row per booking, kind and day.
 */
@Entity
@Table(name = "notices", schema = "booking")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BookingNotice extends BaseEntity {

    /** Persisted, so a constant is never removed or renamed. */
    public enum Kind {
        /** The property was told a booked bed must be freed for a booking to start. Once a day. */
        BED_NOT_FREE,
        // Told to the tenant, by push, in-app notice and mail, once each (2026-10-18).
        /** The property confirmed the booking. */
        TENANT_CONFIRMED,
        /** The tenant's one move of the date. */
        TENANT_DATE_MOVED,
        /** The day before the move-in date. */
        TENANT_MOVE_IN_TOMORROW,
        TENANT_CANCELLED,
        TENANT_EXPIRED,
        /** The move-in day came and the bed was not free. */
        TENANT_BED_NOT_READY,
        // Before confirmation, a push only, and the reminders (2026-10-19).
        /** The property's offer is waiting on the tenant. One per offer. */
        TENANT_OFFER,
        /** Rent agreed, the token due. */
        TENANT_TERMS_AGREED,
        /** The token's time runs out within twelve hours. */
        TENANT_TOKEN_LAPSING,
        /** The property says it sent the refund. */
        TENANT_REFUND_SENT,
        /** The request runs out within a day and the property's offer waits on the tenant. One per offer. */
        TENANT_YOUR_TURN,
        /** The request runs out within a day and the tenant's offer waits on the property. One per offer. */
        PROPERTY_YOUR_TURN,
        /** The tenant's offer has waited a day for the property's answer. One per offer. */
        PROPERTY_WAITING,
        /** A token claim has waited a day for the property's answer. One per claim. */
        PROPERTY_CLAIM_WAITING,
        /** A refund the property owes. Once a day while it does. */
        PROPERTY_REFUND_OWED
    }

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "request_id", nullable = false, updatable = false)
    private UUID requestId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false, length = 40)
    private Kind kind;

    /** The day the notice is about, on the property's calendar. */
    @Column(name = "notice_date", nullable = false, updatable = false)
    private LocalDate noticeDate;

    @Column(name = "sent_at", nullable = false, updatable = false)
    private Instant sentAt;

    public static BookingNotice of(UUID requestId, Kind kind, LocalDate noticeDate, Instant sentAt) {
        BookingNotice notice = new BookingNotice();
        notice.id = UUID.randomUUID();
        notice.requestId = requestId;
        notice.kind = kind;
        notice.noticeDate = noticeDate;
        notice.sentAt = sentAt;
        return notice;
    }
}
