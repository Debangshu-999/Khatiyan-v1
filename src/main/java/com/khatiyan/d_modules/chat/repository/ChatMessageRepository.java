package com.khatiyan.d_modules.chat.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.chat.model.ChatMessage;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, UUID> {

    /**
     * The newest page of a conversation, for opening it.
     *
     * <p>Descending because "the last fifty" is what a chat screen opens on; the
     * caller reverses for display.
     *
     * <p>{@code afterSeq} is the reader's own clear mark, zero for almost
     * everyone. It cannot be folded into {@code findAfter}: that one reads
     * ASCENDING, so on a thread with two hundred messages since the clear it
     * would open on the oldest fifty rather than the newest.
     */
    @Query("""
            SELECT message
            FROM ChatMessage message
            WHERE message.threadId = :threadId
              AND message.seq > :afterSeq
            ORDER BY message.seq DESC
            """)
    List<ChatMessage> findLatestAfter(UUID threadId, long afterSeq, Pageable pageable);

    /**
     * Everything after a cursor, oldest first — the poll.
     *
     * <p>This is what makes a four-second poll affordable: a thread with nothing
     * new is an indexed lookup returning an empty list.
     */
    @Query("""
            SELECT message
            FROM ChatMessage message
            WHERE message.threadId = :threadId
              AND message.seq > :afterSeq
            ORDER BY message.seq ASC
            """)
    List<ChatMessage> findAfter(UUID threadId, long afterSeq, Pageable pageable);
}
