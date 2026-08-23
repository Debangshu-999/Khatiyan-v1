package com.khatiyan.d_modules.chat.model;

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
 * One conversation.
 *
 * <p>A thread never stores who is on the management side. For a {@link
 * ChatThreadKind#TEAM} thread that side is the property's current management,
 * resolved on every request — writing it down would freeze a set that changes,
 * and a manager added next week would be locked out of a conversation they are
 * meant to cover. Only the outsider gets a membership row.
 *
 * <p>The last-message fields are denormalised copies. A conversation list shows
 * a preview and a time per row; without them that screen is a correlated
 * subquery per thread.
 */
@Entity
@Table(name = "chat_threads", schema = "chat")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatThread extends BaseEntity {

    public static final int MAX_PREVIEW_LENGTH = 140;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private ChatThreadKind kind;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private ChatThreadOrigin origin;

    @Column(name = "origin_id", updatable = false)
    private UUID originId;

    @Column(name = "pair_key", updatable = false)
    private String pairKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ChatThreadStatus status;

    @Column(name = "last_message_at")
    private Instant lastMessageAt;

    @Column(name = "last_message_seq")
    private Long lastMessageSeq;

    @Column(name = "last_message_preview", length = MAX_PREVIEW_LENGTH)
    private String lastMessagePreview;

    @Column(name = "last_message_kind")
    private String lastMessageKind;

    private ChatThread(
            UUID propertyId,
            ChatThreadKind kind,
            ChatThreadOrigin origin,
            UUID originId,
            String pairKey) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.kind = kind;
        this.origin = origin;
        this.originId = originId;
        this.pairKey = pairKey;
        this.status = ChatThreadStatus.OPEN;
    }

    /** A tenant and the property's management team. One per tenancy. */
    public static ChatThread forTenancy(UUID propertyId, UUID tenancyId) {
        return new ChatThread(propertyId, ChatThreadKind.TEAM, ChatThreadOrigin.TENANCY, tenancyId, null);
    }

    /**
     * A prospect and the one person who answered their enquiry.
     *
     * <p>No pair key on purpose. A prospect may enquire again once the first
     * enquiry is answered, and the same manager may answer again — two
     * legitimate threads between the same pair. Keyed on the pair, the second
     * enquiry could never open.
     */
    public static ChatThread forEnquiry(UUID propertyId, UUID enquiryId) {
        return new ChatThread(propertyId, ChatThreadKind.DIRECT, ChatThreadOrigin.ENQUIRY, enquiryId, null);
    }

    /** A one-to-one between two named people. */
    public static ChatThread personal(UUID propertyId, UUID firstUserId, UUID secondUserId) {
        return new ChatThread(
                propertyId,
                ChatThreadKind.DIRECT,
                ChatThreadOrigin.PERSONAL,
                null,
                pairKey(propertyId, firstUserId, secondUserId));
    }

    /**
     * The key that stops two people accumulating duplicate one-to-ones.
     *
     * <p>Sorted, so it does not matter who tapped first — both orders produce
     * the same string and the second insert loses to the unique index instead of
     * opening a second conversation each side replies into separately.
     */
    public static String pairKey(UUID propertyId, UUID firstUserId, UUID secondUserId) {
        String first = firstUserId.toString();
        String second = secondUserId.toString();
        String low = first.compareTo(second) <= 0 ? first : second;
        String high = first.compareTo(second) <= 0 ? second : first;
        return propertyId + ":" + low + ":" + high;
    }

    /**
     * Records the newest message, so a list can render without reading messages.
     *
     * <p><b>Never moves backwards.</b> Two sends in one conversation take their
     * sequence numbers at INSERT but reach this update in whatever order they win
     * the thread's row lock — so the one holding 811 can arrive after the one
     * holding 812. Assigning unconditionally would leave the thread claiming 811
     * is the newest message, showing a stale preview and, far worse, computing
     * unread against a seq that a reader has already passed: 812 would sit
     * unread in a thread that looks read.
     */
    public void noteLastMessage(long seq, Instant sentAt, String preview, ChatAttachmentKind attachmentKind) {
        if (this.lastMessageSeq != null && this.lastMessageSeq >= seq) {
            return;
        }

        this.lastMessageSeq = seq;
        this.lastMessageAt = sentAt;
        this.lastMessagePreview = trimPreview(preview);
        this.lastMessageKind = attachmentKind == null ? "TEXT" : attachmentKind.name();
    }

    /**
     * Refreshes the denormalised preview without touching the sequence.
     *
     * <p>For an edit to the newest message. {@link #noteLastMessage} refuses a
     * seq it already holds — correctly, since that guard is what stops two
     * concurrent sends writing the older one last — so an edit has to say
     * explicitly that only the words changed.
     */
    public void repeatLastMessagePreview(String preview) {
        this.lastMessagePreview = trimPreview(preview);
    }

    /**
     * Ends the conversation without deleting it.
     *
     * <p>Idempotent: closing twice is not an error, because both parties can
     * close an enquiry thread and either may act on a stale screen.
     */
    public void close() {
        this.status = ChatThreadStatus.READ_ONLY;
    }

    public boolean isOpen() {
        return this.status == ChatThreadStatus.OPEN;
    }

    /** Refuses a write to a thread that has been closed or whose stay has ended. */
    public void ensureWritable() {
        if (!isOpen()) {
            throw new ValidationException("This conversation is closed and can no longer be replied to.");
        }
    }

    private static String trimPreview(String preview) {
        if (preview == null) {
            return null;
        }
        String collapsed = preview.replaceAll("\\s+", " ").trim();
        return collapsed.length() <= MAX_PREVIEW_LENGTH
                ? collapsed
                : collapsed.substring(0, MAX_PREVIEW_LENGTH);
    }
}
