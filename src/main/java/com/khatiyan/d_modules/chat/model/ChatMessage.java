package com.khatiyan.d_modules.chat.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One message in a conversation.
 *
 * <p>Ordered by {@link #seq}, never by time. Timestamps are not unique, and a
 * conversation ordered by a value two messages can share reorders itself between
 * renders — which is also why the client's "everything after N" poll reads this
 * column rather than a date.
 */
@Entity
@Table(name = "chat_messages", schema = "chat")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatMessage extends BaseEntity {

    public static final int MAX_BODY_LENGTH = 2000;
    public static final int MAX_ATTACHMENTS = 5;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    /**
     * Allocated by the database, read back after insert.
     *
     * <p>A single global sequence rather than a counter per thread: one column
     * then serves every cursor, and there is no per-thread row for concurrent
     * senders to contend on.
     */
    @Generated(event = EventType.INSERT)
    @Column(name = "seq", insertable = false, updatable = false)
    private Long seq;

    @Column(name = "thread_id", nullable = false, updatable = false)
    private UUID threadId;

    @Column(name = "author_user_id", nullable = false, updatable = false)
    private UUID authorUserId;

    /** Null when the message carries only attachments. */
    @Column(length = MAX_BODY_LENGTH)
    private String body;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "edited_at")
    private Instant editedAt;

    @OneToMany(cascade = CascadeType.ALL, fetch = FetchType.LAZY, orphanRemoval = true)
    @JoinColumn(name = "message_id", nullable = false)
    @OrderBy("sortOrder ASC")
    private List<ChatMessageAttachment> attachments = new ArrayList<>();

    private ChatMessage(UUID threadId, UUID authorUserId, String body) {
        this.id = UUID.randomUUID();
        this.threadId = threadId;
        this.authorUserId = authorUserId;
        this.body = body;
    }

    /**
     * @param body        trimmed text, or null for an attachments-only message
     * @param attachments already-uploaded assets, in the order they were picked
     */
    public static ChatMessage of(
            UUID threadId, UUID authorUserId, String body, List<ChatMessageAttachment> attachments) {
        String trimmed = body == null || body.isBlank() ? null : body.trim();
        List<ChatMessageAttachment> resolved = attachments == null ? List.of() : attachments;

        if (trimmed == null && resolved.isEmpty()) {
            throw new ValidationException("A message needs either text or an attachment");
        }
        if (trimmed != null && trimmed.length() > MAX_BODY_LENGTH) {
            throw new ValidationException("A message cannot be longer than " + MAX_BODY_LENGTH + " characters");
        }
        if (resolved.size() > MAX_ATTACHMENTS) {
            throw new ValidationException("A message cannot carry more than " + MAX_ATTACHMENTS + " attachments");
        }

        ChatMessage message = new ChatMessage(threadId, authorUserId, trimmed);
        for (int at = 0; at < resolved.size(); at++) {
            resolved.get(at).placeAt(at);
            message.attachments.add(resolved.get(at));
        }
        return message;
    }

    /**
     * Rewrites the text, by its author.
     *
     * <p>Refused on a message carrying attachments. The asset is already in
     * storage and already seen; letting the words around it change while the
     * picture stays would be editing the caption of something the reader has
     * a different memory of. Send another message instead.
     *
     * <p>No time window. A window is a real product decision — WhatsApp allows
     * fifteen minutes — and imposing one silently would be choosing it by
     * accident. The edit marker is what protects the reader meanwhile.
     */
    public void editBy(UUID actorUserId, String newBody, Instant now) {
        if (!this.authorUserId.equals(actorUserId)) {
            throw new ValidationException("Only the sender can edit a message");
        }
        if (isDeleted()) {
            throw new ValidationException("A deleted message cannot be edited");
        }
        if (!this.attachments.isEmpty()) {
            throw new ValidationException("A message with an attachment cannot be edited");
        }

        String trimmed = newBody == null ? "" : newBody.trim();
        if (trimmed.isEmpty()) {
            throw new ValidationException("A message cannot be emptied. Delete it instead.");
        }
        if (trimmed.length() > MAX_BODY_LENGTH) {
            throw new ValidationException("A message cannot be longer than " + MAX_BODY_LENGTH + " characters");
        }
        if (trimmed.equals(this.body)) {
            // Nothing changed, so nothing is marked. An "edited" tag on an
            // unchanged message is a lie the reader cannot check.
            return;
        }

        this.body = trimmed;
        this.editedAt = now;
    }

    public boolean isEdited() {
        return this.editedAt != null;
    }

    /**
     * Hides the message from both sides without removing it.
     *
     * <p>Soft, so the sequence stays intact and the conversation does not silently
     * rewrite itself for the person who already read it. Idempotent: a second
     * delete keeps the first timestamp, because when it happened is a fact.
     */
    public void deleteBy(UUID actorUserId, Instant now) {
        if (!this.authorUserId.equals(actorUserId)) {
            throw new ValidationException("Only the sender can delete a message");
        }
        if (this.deletedAt == null) {
            this.deletedAt = now;
        }
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }

    /** What the thread list shows for this message. Attachments have no text of their own. */
    public String preview() {
        if (isDeleted()) {
            return "Message deleted";
        }
        if (this.body != null) {
            return this.body;
        }
        return attachmentKind() == ChatAttachmentKind.IMAGE ? "Photo" : "File";
    }

    /** The kind of the first attachment, or null for a text message. */
    public ChatAttachmentKind attachmentKind() {
        return this.attachments.isEmpty() ? null : this.attachments.get(0).getKind();
    }
}
