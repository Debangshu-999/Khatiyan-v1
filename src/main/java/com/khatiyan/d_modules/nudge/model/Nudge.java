package com.khatiyan.d_modules.nudge.model;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A short, one-way message from management to one tenant.
 *
 * <p>The tenant cannot reply, mute, clear or archive it — which is the whole
 * reason the cooldown below exists. Nudges go to a captive audience, so the only
 * thing standing between a tenant and twenty messages in an evening is this
 * class refusing to make the twenty-first.
 */
@Entity
@Table(name = "nudges", schema = "nudge")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Nudge extends BaseEntity {

    /**
     * How long a tenant is left alone after being nudged.
     *
     * <p>Keyed on the tenant, not the sender: an owner and their manager sending
     * one each is still two messages arriving at the same person, so a second
     * sender must not reset the timer.
     */
    public static final Duration COOLDOWN = Duration.ofHours(3);

    public static final int MAX_MESSAGE_LENGTH = 200;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "tenancy_id", nullable = false)
    private UUID tenancyId;

    @Column(name = "recipient_user_id", nullable = false)
    private UUID recipientUserId;

    @Column(name = "sender_user_id", nullable = false)
    private UUID senderUserId;

    @Column(nullable = false, length = MAX_MESSAGE_LENGTH)
    private String message;

    @Column(name = "sent_at", nullable = false)
    private Instant sentAt;

    @Column(name = "read_at")
    private Instant readAt;

    private Nudge(
            UUID propertyId,
            UUID tenancyId,
            UUID recipientUserId,
            UUID senderUserId,
            String message,
            Instant sentAt) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.tenancyId = tenancyId;
        this.recipientUserId = recipientUserId;
        this.senderUserId = senderUserId;
        this.message = message;
        this.sentAt = sentAt;
    }

    public static Nudge send(
            UUID propertyId,
            UUID tenancyId,
            UUID recipientUserId,
            UUID senderUserId,
            String message,
            Instant sentAt) {
        String trimmed = message == null ? "" : message.trim();
        if (trimmed.isEmpty()) {
            throw new ValidationException("A nudge needs a message.");
        }
        if (trimmed.length() > MAX_MESSAGE_LENGTH) {
            throw new ValidationException("A nudge can be at most " + MAX_MESSAGE_LENGTH + " characters.");
        }
        return new Nudge(propertyId, tenancyId, recipientUserId, senderUserId, trimmed, sentAt);
    }

    /**
     * The earliest this tenant may be nudged again.
     *
     * <p>Exposed rather than kept as a boolean so the send screen can show the
     * time remaining. A tenant list that only knew "blocked" would leave the
     * owner tapping a dead button to find out when it wakes up.
     */
    public Instant cooldownEndsAt() {
        return sentAt.plus(COOLDOWN);
    }

    public boolean isInCooldownAt(Instant now) {
        return now.isBefore(cooldownEndsAt());
    }

    /**
     * Marked when the tenant opens their nudges screen. Idempotent — the screen
     * marks the whole page on every open, and the first read is the true one.
     */
    public void markRead(Instant now) {
        if (readAt == null) {
            this.readAt = now;
        }
    }
}
