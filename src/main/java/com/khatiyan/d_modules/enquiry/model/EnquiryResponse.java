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
 * One attempt by management to reach an enquirer, and how it ended.
 *
 * <p>Its own table rather than columns on {@link Enquiry}, so a conversation
 * grows downward: each attempt is a row, and together they are the action log.
 *
 * <p><b>An attempt is not an answer</b> (owner's rule, 2026-10-02). Tapping Call
 * opens the dialer, and the app cannot know whether anyone picked up: Google
 * Play does not allow a non-dialer app to read the call log. So the row starts
 * {@link EnquiryAttemptOutcome#OPEN} and the handler settles it. A chat message
 * also starts open, and is settled by the enquirer's reply, or by the enquiry
 * expiring. The enquiry is answered only when an attempt succeeds.
 *
 * <p>Rows written before this existed are all {@code SUCCEEDED}: each marked its
 * enquiry answered the moment it was saved.
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

    /** Talking points on a success, or why it failed ("Call did not connect"). Optional either way. */
    @Column(length = MAX_NOTE_LENGTH)
    private String note;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EnquiryAttemptOutcome outcome;

    @Column(name = "settled_at")
    private Instant settledAt;

    /** How a call went, when the handler recorded it in that detail. */
    @Enumerated(EnumType.STRING)
    @Column(name = "call_result", length = 30)
    private EnquiryCallResult callResult;

    /** How long an accepted call ran, when the handler said. */
    @Column(name = "duration_seconds")
    private Integer durationSeconds;

    private EnquiryResponse(UUID enquiryId, EnquiryResponseChannel channel, UUID respondedByUserId) {
        this.id = UUID.randomUUID();
        this.enquiryId = enquiryId;
        this.channel = channel;
        this.respondedByUserId = respondedByUserId;
        this.outcome = EnquiryAttemptOutcome.OPEN;
    }

    /** A new attempt, open until it is settled. */
    public static EnquiryResponse attempt(UUID enquiryId, EnquiryResponseChannel channel, UUID byUserId) {
        if (channel == null) {
            throw new ValidationException("Choose how you will get back to them.");
        }
        // Removed as a channel on 2026-10-02: a sent email cannot be tracked, so
        // nobody could ever say whether it reached anyone. The constant stays in
        // the enum because rows already stored carry it.
        if (channel == EnquiryResponseChannel.EMAIL) {
            throw new ValidationException("Email is no longer a way to respond. Use chat or a call.");
        }
        return new EnquiryResponse(enquiryId, channel, byUserId);
    }

    /**
     * A note written while starting the attempt, before its outcome is known.
     * Kept unless the settling note replaces it.
     */
    public EnquiryResponse withNote(String note) {
        this.note = clean(note);
        return this;
    }

    public boolean isOpen() {
        return outcome == EnquiryAttemptOutcome.OPEN;
    }

    public boolean succeeded() {
        return outcome == EnquiryAttemptOutcome.SUCCEEDED;
    }

    /**
     * Ends the attempt.
     *
     * @param note optional, trimmed, and kept whichever way it ended
     */
    public void settle(EnquiryAttemptOutcome result, String note, Instant now) {
        if (!isOpen()) {
            throw new ValidationException("This attempt is already settled.");
        }
        if (result == null || result == EnquiryAttemptOutcome.OPEN) {
            throw new ValidationException("Say whether they responded.");
        }
        String settlingNote = clean(note);
        this.outcome = result;
        // No note on settling leaves the one written at the start in place.
        if (settlingNote != null) {
            this.note = settlingNote;
        }
        this.settledAt = now;
    }

    /**
     * Ends a call with how it went: "Record response". The result decides
     * success or failure.
     *
     * @param durationSeconds optional, 0 to 86 399
     */
    public void settleCall(EnquiryCallResult result, Integer durationSeconds, String note, Instant now) {
        if (channel != EnquiryResponseChannel.CALL_BACK) {
            throw new ValidationException("Only a call is recorded this way.");
        }
        if (result == null) {
            throw new ValidationException("Say how the call went.");
        }
        if (durationSeconds != null && (durationSeconds < 0 || durationSeconds > 86_399)) {
            throw new ValidationException("A call can be at most 23 hours, 59 minutes and 59 seconds.");
        }
        settle(result.outcome(), note, now);
        this.callResult = result;
        this.durationSeconds = durationSeconds;
    }

    private static String clean(String note) {
        String trimmed = note == null ? null : note.trim();
        if (trimmed == null || trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() > MAX_NOTE_LENGTH) {
            throw new ValidationException("The note can be at most " + MAX_NOTE_LENGTH + " characters.");
        }
        return trimmed;
    }
}
