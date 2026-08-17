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
 * A question asked about a property from its public profile.
 *
 * <p>The enquiry is the thread root. It holds the question and its state;
 * the answer is an {@link EnquiryResponse} row, so that when chat arrives the
 * conversation grows downward rather than forcing this table to be reshaped.
 */
@Entity
@Table(name = "enquiries", schema = "enquiry")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Enquiry extends BaseEntity {

    public static final int MAX_MESSAGE_LENGTH = 500;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "enquirer_user_id", nullable = false)
    private UUID enquirerUserId;

    @Column(nullable = false, length = MAX_MESSAGE_LENGTH)
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EnquiryStatus status;

    private Enquiry(UUID propertyId, UUID enquirerUserId, String message) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.enquirerUserId = enquirerUserId;
        this.message = message;
        this.status = EnquiryStatus.NEW;
    }

    public static Enquiry raise(UUID propertyId, UUID enquirerUserId, String message) {
        String trimmed = message == null ? "" : message.trim();
        if (trimmed.isEmpty()) {
            throw new ValidationException("Write what you would like to ask.");
        }
        if (trimmed.length() > MAX_MESSAGE_LENGTH) {
            throw new ValidationException("An enquiry can be at most " + MAX_MESSAGE_LENGTH + " characters.");
        }
        return new Enquiry(propertyId, enquirerUserId, trimmed);
    }

    public boolean isOpen() {
        return status == EnquiryStatus.NEW;
    }

    /**
     * Marks the enquiry as dealt with. Idempotent by design.
     *
     * <p>An earlier version threw on a second response, back when choosing a
     * channel was a promise made to the enquirer and changing it would have left
     * them waiting on the wrong one. It no longer is: picking a channel opens the
     * dialer or the mail app, and an owner may reasonably call twice, or call and
     * then write. Each attempt is its own row; the status only ever moves once.
     */
    public void markResponded() {
        this.status = EnquiryStatus.RESPONDED;
    }

    /** The instant the question was asked — {@code createdAt}, named for readers. */
    public Instant askedAt() {
        return getCreatedAt();
    }
}
