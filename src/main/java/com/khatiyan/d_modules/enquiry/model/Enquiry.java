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

    /**
     * How long an unanswered enquiry stays actionable.
     *
     * <p>Thirty days since 2026-10-02 (it was seven). Someone planning a move
     * next month is still looking a week later, and with attempts that can fail
     * a week was not long enough to reach them.
     */
    public static final Duration LIFETIME = Duration.ofDays(30);

    /**
     * How long an EXPIRED enquiry stays visible after it stopped being
     * actionable.
     *
     * <p>One more day, so nothing vanishes between two glances at the list. The
     * owner sees it greyed out and unactionable for a day first, which is the
     * difference between "this closed" and "where did that go".
     */
    public static final Duration VISIBLE_AFTER_EXPIRY = Duration.ofDays(30);

    /**
     * How long a Not interested enquiry stays open before it closes by itself
     * (owner's design, 2026-10-03). The enquirer may change their mind in it.
     */
    public static final Duration NOT_INTERESTED_GRACE = Duration.ofDays(7);

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

    /**
     * The owner or manager handling this enquiry, or null while nobody is.
     *
     * <p>How they are chosen is the property's {@link EnquiryHandlerMode}. Once
     * set, only they and the owner may act on the enquiry.
     */
    @Column(name = "handler_user_id")
    private UUID handlerUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "handler_assigned_by", length = 20)
    private EnquiryHandlerAssignment handlerAssignedBy;

    /** The owner who assigned it, when the owner did. */
    @Column(name = "handler_assigned_by_user_id")
    private UUID handlerAssignedByUserId;

    @Column(name = "handler_assigned_at")
    private Instant handlerAssignedAt;

    /** When the first attempt succeeded. Null while unanswered. */
    @Column(name = "responded_at")
    private Instant respondedAt;

    /** The handler's reading of the enquirer. Null until they give one. */
    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private EnquirySentiment sentiment;

    @Column(name = "sentiment_set_by_user_id")
    private UUID sentimentSetByUserId;

    @Column(name = "sentiment_set_at")
    private Instant sentimentSetAt;

    /** When the handler ended the conversation. Null when nobody did. */
    @Column(name = "ended_at")
    private Instant endedAt;

    @Column(name = "ended_by_user_id")
    private UUID endedByUserId;

    /** When its chat was closed, by ending or by the sweep. Null while the chat is open, or there is none. */
    @Column(name = "chat_closed_at")
    private Instant chatClosedAt;

    /**
     * When the sweep saw an answered enquiry's date pass, and said so. Null
     * until then, and for the ones that expire unanswered or are ended by hand,
     * which announce their own end.
     */
    @Column(name = "window_closed_at")
    private Instant windowClosedAt;

    /** When the enquirer answered "Changed your mind?". Once only. */
    @Column(name = "tenant_changed_mind_at")
    private Instant tenantChangedMindAt;

    /** When management last turned a Not interested back to Interested, and who. */
    @Column(name = "handler_reversed_at")
    private Instant handlerReversedAt;

    @Column(name = "handler_reversed_by_user_id")
    private UUID handlerReversedByUserId;

    /** Why it ended. Null while it is live. */
    @Enumerated(EnumType.STRING)
    @Column(name = "end_reason", length = 30)
    private EnquiryEndReason endReason;

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

    /**
     * Whether this enquiry's window has closed. Answered or not.
     *
     * <p><b>By the clock, not by the status.</b> The status only says what
     * {@link com.khatiyan.d_modules.enquiry.service.EnquiryExpirySchedulerService}
     * has recorded, and that runs on a cron — so between the deadline passing
     * and the next run an unanswered enquiry is still {@code NEW}. Asking the
     * status answered "not expired" for hours after it was, and the guard in
     * {@code respond} that was meant to be the backstop asked this same
     * question and agreed with the stale card.
     *
     * <p><b>And regardless of whether it was answered.</b> A reply inside the
     * window does not reopen it. The date is the life of the question, not a
     * deadline on the first response: a month-old enquiry someone called about
     * once is closed, and calling it again is answering something the enquirer
     * stopped waiting on weeks ago.
     *
     * <p>{@link #expire()} is deliberately narrower — it only moves {@code NEW},
     * because the status column records what happened to the enquiry and
     * restamping an answered one would rewrite that.
     */
    public boolean isExpired() {
        return status == EnquiryStatus.EXPIRED
                || (expiresAt != null && !Instant.now().isBefore(expiresAt));
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
     * Marks the enquiry answered, because an attempt to reach the enquirer
     * succeeded. Idempotent by design.
     *
     * <p>Each attempt is its own row, and the handler may call twice, or call
     * and then write. The status only ever moves once, and {@code respondedAt}
     * keeps the moment of the FIRST success: the tenant's time to book a visit
     * runs from it.
     *
     * @return true the first time, false when it was answered or expired already
     */
    public boolean markResponded(Instant now) {
        if (this.status != EnquiryStatus.NEW) {
            return false;
        }
        this.status = EnquiryStatus.RESPONDED;
        this.respondedAt = now;
        return true;
    }

    /**
     * Gives the enquiry to a handler, for the first time or a new one.
     *
     * @param byUserId the owner who assigned it, kept only when {@code how} is OWNER
     */
    public void assignHandler(UUID handlerUserId, EnquiryHandlerAssignment how, UUID byUserId, Instant now) {
        if (handlerUserId == null || how == null) {
            throw new ValidationException("Choose who handles this enquiry.");
        }
        this.handlerUserId = handlerUserId;
        this.handlerAssignedBy = how;
        this.handlerAssignedByUserId = how == EnquiryHandlerAssignment.OWNER ? byUserId : null;
        this.handlerAssignedAt = now;
    }

    public boolean hasHandler() {
        return handlerUserId != null;
    }

    /** Records, or changes, what the handler makes of the enquirer. */
    public void setSentiment(EnquirySentiment sentiment, UUID byUserId, Instant now) {
        if (sentiment == null) {
            throw new ValidationException("Choose Interested or Not interested.");
        }
        // Management taking a Not interested back is a reversal worth logging
        // (owner's design, 2026-10-03). The enquirer's own is tenantChangedMindAt.
        if (this.sentiment == EnquirySentiment.NOT_INTERESTED
                && sentiment == EnquirySentiment.INTERESTED
                && !byUserId.equals(enquirerUserId)) {
            this.handlerReversedAt = now;
            this.handlerReversedByUserId = byUserId;
        }
        this.sentiment = sentiment;
        this.sentimentSetByUserId = byUserId;
        this.sentimentSetAt = now;
    }

    /** Takes the handler's reading back to undecided ("Not decided", 2026-10-02). */
    public void clearSentiment() {
        this.sentiment = null;
        this.sentimentSetByUserId = null;
        this.sentimentSetAt = null;
    }

    public boolean isEnded() {
        return endedAt != null;
    }

    /**
     * Whether nothing more can be done with it: closed by the handler, or past
     * its date.
     */
    public boolean isOver() {
        return isEnded() || isExpired();
    }

    /**
     * Closes the enquiry now: the handler marked them not interested and
     * closed it (Close enquiry on the card, End conversation in the chat).
     *
     * <p>Its 30 days are not cut short (owner's rule, 2026-10-03). It reads
     * Closed until its usual date, then Expired. Only an answered enquiry is
     * closed, so the status, which records that it was answered, stays.
     *
     * @return true when it closed now, false when it had closed already
     */
    public boolean end(UUID byUserId, Instant now) {
        if (isEnded()) {
            return false;
        }
        this.endedAt = now;
        this.endedByUserId = byUserId;
        recordEndReason(EnquiryEndReason.NOT_INTERESTED);
        return true;
    }

    /**
     * When a Not interested enquiry closes by itself, or null when it is not
     * one that will: not marked so, or already closed.
     */
    public Instant notInterestedClosesAt() {
        if (sentiment != EnquirySentiment.NOT_INTERESTED || isEnded() || sentimentSetAt == null) {
            return null;
        }
        return sentimentSetAt.plus(NOT_INTERESTED_GRACE);
    }

    /**
     * Whether the enquirer may still answer "Changed your mind?": while a Not
     * interested runs its 7 days, or once it has closed as Not interested and
     * not yet expired (owner's rule, 2026-10-03). Once only, either way.
     */
    public boolean mayChangeMind() {
        if (tenantChangedMindAt != null || isExpired()) {
            return false;
        }
        return notInterestedClosesAt() != null || isClosedAsNotInterested();
    }

    /** Closed by management, or by the 7-day sweep, as not interested. */
    public boolean isClosedAsNotInterested() {
        return isEnded() && endReason == EnquiryEndReason.NOT_INTERESTED;
    }

    /**
     * The enquirer takes back the Not interested: Interested again, set by them.
     * Once only, so a second Not interested closes the enquiry instead.
     *
     * <p>A closed one is reopened (owner's rule, 2026-10-03): no longer ended,
     * its chat no longer marked closed. The caller reopens the thread itself.
     *
     * @return true when it was closed and is now open again
     */
    public boolean changeMind(UUID enquirerUserId, Instant now) {
        if (!mayChangeMind()) {
            throw new ValidationException(tenantChangedMindAt != null
                    ? "You have already told the property you are interested."
                    : "This enquiry is not waiting on that.");
        }
        boolean reopened = isEnded();
        if (reopened) {
            this.endedAt = null;
            this.endedByUserId = null;
            this.endReason = null;
            this.chatClosedAt = null;
        }
        setSentiment(EnquirySentiment.INTERESTED, enquirerUserId, now);
        this.tenantChangedMindAt = now;
        return reopened;
    }

    /**
     * Expires it now, ahead of its date: a closed enquiry the enquirer has
     * replaced with a fresh one (owner's rule, 2026-10-03). Its end reason stays,
     * so the expired card still says why it ended.
     */
    public void expireNow(Instant now) {
        if (expiresAt == null || expiresAt.isAfter(now)) {
            this.expiresAt = now;
        }
        expire();
    }

    /** Keeps the first reason given. An enquiry ends once. */
    public void recordEndReason(EnquiryEndReason reason) {
        if (this.endReason == null) {
            this.endReason = reason;
        }
    }

    /** Whether it has a chat that is still open. */
    public boolean hasOpenChat() {
        return chatThreadId != null && chatClosedAt == null;
    }

    /**
     * Records that an answered enquiry's window has closed.
     *
     * @return true the first time, false when it was recorded already
     */
    public boolean markWindowClosed(Instant now) {
        if (this.windowClosedAt != null) {
            return false;
        }
        this.windowClosedAt = now;
        return true;
    }

    public void markChatClosed(Instant now) {
        if (this.chatClosedAt == null) {
            this.chatClosedAt = now;
        }
    }

    public boolean isHandledBy(UUID userId) {
        return handlerUserId != null && handlerUserId.equals(userId);
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
