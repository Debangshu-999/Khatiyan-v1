package com.khatiyan.d_modules.chat.model;

import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * How far one person has read one thread.
 *
 * <p>Per person even for the shared sections. A single "handled" flag across
 * management was rejected because it makes the owner blind: a manager reading
 * first would clear the thread from the owner's view, and the owner is
 * accountable for what is said on their property's behalf.
 *
 * <p>Rows are written lazily, on first open. <b>A missing row means everything
 * is unread</b> — the right default for a manager who has never looked. Do not
 * pre-create rows for every manager: management membership is resolved per
 * request, and a materialised list goes stale the moment somebody is removed.
 */
@Entity
@Table(name = "chat_read_state", schema = "chat")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatReadState extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "thread_id", nullable = false, updatable = false)
    private UUID threadId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "last_read_seq", nullable = false)
    private long lastReadSeq;

    /**
     * Everything at or below this is gone, for this person only.
     *
     * <p>Zero means nothing has been cleared, which is every row until somebody
     * deletes a conversation.
     */
    @Column(name = "cleared_at_seq", nullable = false)
    private long clearedAtSeq;

    private ChatReadState(UUID threadId, UUID userId, long lastReadSeq) {
        this.id = UUID.randomUUID();
        this.threadId = threadId;
        this.userId = userId;
        this.lastReadSeq = lastReadSeq;
    }

    public static ChatReadState of(UUID threadId, UUID userId, long lastReadSeq) {
        return new ChatReadState(threadId, userId, Math.max(0L, lastReadSeq));
    }

    /**
     * Moves the read mark forward, never back.
     *
     * <p>Two devices reporting different positions is normal, and the later one
     * may well arrive first. Taking the maximum means a stale report cannot
     * re-light a badge the reader has already cleared.
     */
    public void advanceTo(long seq) {
        if (seq > this.lastReadSeq) {
            this.lastReadSeq = seq;
        }
    }

    /**
     * Clears the conversation up to a point, for this person.
     *
     * <p>Forward only, like {@link #advanceTo}: clearing is a thing that
     * happened, and a later delete of a shorter thread must not un-hide what an
     * earlier one already put away.
     *
     * <p>The read mark moves with it. Without that the thread would come back
     * the moment it was cleared and be unread as well, because every message it
     * is hiding would still count as never seen.
     */
    public void clearUpTo(long seq) {
        if (seq > this.clearedAtSeq) {
            this.clearedAtSeq = seq;
        }
        advanceTo(seq);
    }
}
