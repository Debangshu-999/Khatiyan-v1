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
 * A named participant in a thread.
 *
 * <p>A TEAM thread holds exactly one of these — the outsider. The management
 * side is deliberately absent: it is resolved per request from whoever currently
 * manages the property, so that a manager added next week can answer and one
 * removed today cannot. Writing the management side down would freeze a set that
 * is supposed to change.
 *
 * <p>A DIRECT thread holds exactly two.
 */
@Entity
@Table(name = "chat_thread_members", schema = "chat")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatThreadMember extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "thread_id", nullable = false, updatable = false)
    private UUID threadId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    private ChatThreadMember(UUID threadId, UUID userId) {
        this.id = UUID.randomUUID();
        this.threadId = threadId;
        this.userId = userId;
    }

    public static ChatThreadMember of(UUID threadId, UUID userId) {
        return new ChatThreadMember(threadId, userId);
    }
}
