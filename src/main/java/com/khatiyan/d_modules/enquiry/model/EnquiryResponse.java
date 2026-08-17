package com.khatiyan.d_modules.enquiry.model;

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
 * Management's answer to an enquiry: the channel they will use to make contact.
 *
 * <p>Its own table rather than columns on {@link Enquiry} because chat is meant
 * to extend enquiries rather than replace them. When a reply becomes a message
 * instead of a promise, it lands here alongside these rows.
 */
@Entity
@Table(name = "enquiry_responses", schema = "enquiry")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EnquiryResponse extends BaseEntity {

    public static final int MAX_NOTE_LENGTH = 500;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "enquiry_id", nullable = false)
    private UUID enquiryId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EnquiryResponseChannel channel;

    @Column(name = "responded_by_user_id", nullable = false)
    private UUID respondedByUserId;

    @Column(length = MAX_NOTE_LENGTH)
    private String note;

    private EnquiryResponse(UUID enquiryId, EnquiryResponseChannel channel, UUID respondedByUserId, String note) {
        this.id = UUID.randomUUID();
        this.enquiryId = enquiryId;
        this.channel = channel;
        this.respondedByUserId = respondedByUserId;
        this.note = note;
    }

    public static EnquiryResponse of(
            UUID enquiryId,
            EnquiryResponseChannel channel,
            UUID respondedByUserId,
            String note) {
        if (channel == null) {
            throw new ValidationException("Choose how you will get back to them.");
        }
        if (channel == EnquiryResponseChannel.CHAT) {
            throw new ValidationException("Chat is not available yet.");
        }
        String trimmedNote = note == null ? null : note.trim();
        if (trimmedNote != null && trimmedNote.isEmpty()) {
            trimmedNote = null;
        }
        if (trimmedNote != null && trimmedNote.length() > MAX_NOTE_LENGTH) {
            throw new ValidationException("The note can be at most " + MAX_NOTE_LENGTH + " characters.");
        }
        return new EnquiryResponse(enquiryId, channel, respondedByUserId, trimmedNote);
    }
}
