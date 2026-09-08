package com.khatiyan.d_modules.enquiry.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

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
 * One enquirer's standing agreement that a property may contact them on a
 * channel.
 *
 * <p>
 * A row IS a grant, mirroring {@code ManagerPermission} — there is no "denied"
 * state to store, because absence of a live row already means not granted. That
 * is what makes "nobody is reachable until they say so" true without a backfill.
 *
 * <p>
 * Withdrawal stamps {@link #revokedAt} rather than deleting. Consent is the one
 * kind of record where the withdrawal matters as much as the grant, and a
 * deleted row cannot show either.
 */
@Entity
@Table(name = "enquiry_channel_consents", schema = "enquiry")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EnquiryChannelConsent extends BaseEntity {

    /**
     * The wording in force when a grant is written.
     *
     * <p>
     * Bumped whenever the modal's agreement text changes materially. Old rows
     * keep the version they were signed under, which is the entire point of
     * storing it — re-stamping them would erase what was actually agreed.
     */
    public static final String CURRENT_TERMS_VERSION = "v1";

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20, updatable = false)
    private EnquiryResponseChannel channel;

    @Column(name = "granted_at", nullable = false, updatable = false)
    private Instant grantedAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "terms_version", nullable = false, length = 20, updatable = false)
    private String termsVersion;

    private EnquiryChannelConsent(UUID userId, EnquiryResponseChannel channel, String termsVersion) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.channel = channel;
        this.grantedAt = Instant.now();
        this.termsVersion = termsVersion;
    }

    /**
     * Records that this person agreed to be reached on this channel.
     *
     * <p>
     * CHAT is refused rather than stored. It is the medium an enquiry lives in,
     * not a contact detail being handed over — always open, never granted, and a
     * row for it would imply it could be withdrawn.
     */
    public static EnquiryChannelConsent grant(UUID userId, EnquiryResponseChannel channel) {
        if (channel == null) {
            throw new ValidationException("Pick at least one way for them to reply.");
        }
        if (channel == EnquiryResponseChannel.CHAT) {
            throw new ValidationException("Chat needs no agreement.");
        }
        return new EnquiryChannelConsent(userId, channel, CURRENT_TERMS_VERSION);
    }

    public boolean isLive() {
        return revokedAt == null;
    }

    /**
     * Withdraws the grant.
     *
     * <p>
     * Idempotent: a second call leaves the original withdrawal time alone. The
     * account-settings master switch sweeps every live row for a channel, and
     * "when did they withdraw" should be the moment they actually did, not the
     * last time something swept.
     */
    public void revoke() {
        if (revokedAt == null) {
            this.revokedAt = Instant.now();
        }
    }
}
