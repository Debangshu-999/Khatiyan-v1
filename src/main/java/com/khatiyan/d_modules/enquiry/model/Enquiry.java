package com.khatiyan.d_modules.enquiry.model;

import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
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

    /** How long an unanswered enquiry stays actionable. */
    public static final Duration LIFETIME = Duration.ofDays(7);

    /**
     * How long an EXPIRED enquiry stays visible after it stopped being
     * actionable.
     *
     * <p>One more day, so nothing vanishes between two glances at the list. The
     * owner sees it greyed out and unactionable for a day first, which is the
     * difference between "this closed" and "where did that go".
     */
    public static final Duration VISIBLE_AFTER_EXPIRY = Duration.ofDays(1);

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

    /**
     * When this stops being actionable.
     *
     * <p>Stored rather than derived from {@code createdAt}: it is shown to the
     * owner on the card, and a date the reader can see should be a fact in the
     * row rather than a sum recomputed in three places that might disagree.
     */
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    /**
     * What the enquirer agreed to share, as it stood when they asked.
     *
     * <p>
     * A snapshot, not a live read. Consent itself is a standing per-person
     * decision, but consulting it live let an enquiry already in a property's
     * queue change shape underneath them — a number they were told they could
     * call vanishing mid-conversation because a setting moved. Changing the
     * standing decision governs the next enquiry and leaves this one as it was
     * asked.
     *
     * <p>
     * EAGER because it is two rows at most and every read of an enquiry needs
     * it: there is no path that loads an enquiry and does not then ask how the
     * enquirer may be reached.
     */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "enquiry_shared_channels",
            schema = "enquiry",
            joinColumns = @JoinColumn(name = "enquiry_id"))
    @Column(name = "channel", nullable = false, length = 20)
    @Enumerated(EnumType.STRING)
    private Set<EnquiryResponseChannel> sharedChannels = EnumSet.noneOf(EnquiryResponseChannel.class);

    /**
     * The conversation this enquiry was answered in, once it has one.
     *
     * <p>
     * A plain id, not a relation: chat is another module and a mapping across
     * that boundary would make loading an enquiry a reason to load a thread.
     * Written once by the responder who opens it, and never cleared — the
     * conversation outlives the enquiry, which expires.
     */
    @Column(name = "chat_thread_id")
    private UUID chatThreadId;

    private Enquiry(UUID propertyId, UUID enquirerUserId, String message, Set<EnquiryResponseChannel> sharedChannels) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.enquirerUserId = enquirerUserId;
        this.message = message;
        this.status = EnquiryStatus.NEW;
        this.expiresAt = Instant.now().plus(LIFETIME);
        this.sharedChannels = sharedChannels;
    }

    public static Enquiry raise(
            UUID propertyId,
            UUID enquirerUserId,
            String message,
            Set<EnquiryResponseChannel> sharedChannels) {
        String trimmed = message == null ? "" : message.trim();
        if (trimmed.isEmpty()) {
            throw new ValidationException("Write what you would like to ask.");
        }
        if (trimmed.length() > MAX_MESSAGE_LENGTH) {
            throw new ValidationException("An enquiry can be at most " + MAX_MESSAGE_LENGTH + " characters.");
        }

        Set<EnquiryResponseChannel> shared = EnumSet.noneOf(EnquiryResponseChannel.class);
        for (EnquiryResponseChannel channel : sharedChannels) {
            // CHAT is always open and is not something anyone handed over, so it
            // is not part of the snapshot. Storing it would imply it could later
            // be found missing.
            if (channel != EnquiryResponseChannel.CHAT) {
                shared.add(channel);
            }
        }
        return new Enquiry(propertyId, enquirerUserId, trimmed, shared);
    }

    public boolean isOpen() {
        return status == EnquiryStatus.NEW;
    }

    public boolean isExpired() {
        return status == EnquiryStatus.EXPIRED;
    }

    /**
     * Ages an unanswered enquiry out. Only ever moves NEW — an answered enquiry
     * is finished, and expiring it afterwards would rewrite history.
     */
    public void expire() {
        if (this.status == EnquiryStatus.NEW) {
            this.status = EnquiryStatus.EXPIRED;
        }
    }

    /** The moment it drops off the owner's list entirely. */
    public Instant hiddenAt() {
        return expiresAt.plus(VISIBLE_AFTER_EXPIRY);
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

    /**
     * Remembers the conversation opened to answer this.
     *
     * <p>Only the first one sticks. Answering by chat twice is ordinary — two
     * managers, or one who came back — and both must land in the conversation
     * that already exists rather than the second overwriting the first.
     */
    public void attachChatThread(UUID threadId) {
        if (this.chatThreadId == null) {
            this.chatThreadId = threadId;
        }
    }

    /** The instant the question was asked — {@code createdAt}, named for readers. */
    public Instant askedAt() {
        return getCreatedAt();
    }
}
