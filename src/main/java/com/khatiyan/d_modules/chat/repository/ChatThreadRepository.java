package com.khatiyan.d_modules.chat.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.chat.model.ChatThread;
import com.khatiyan.d_modules.chat.model.ChatThreadKind;
import com.khatiyan.d_modules.chat.model.ChatThreadOrigin;

@Repository
public interface ChatThreadRepository extends JpaRepository<ChatThread, UUID> {

    Optional<ChatThread> findByOriginAndOriginId(ChatThreadOrigin origin, UUID originId);

    Optional<ChatThread> findByPairKey(String pairKey);

    /**
     * One management section.
     *
     * <p>My chats, Tenants and Enquiries are all this query with different
     * kind/origin pairs — which is the point of deriving the sections from two
     * columns rather than storing a section on the row.
     *
     * <p>Threads that have never been written in sort last: {@code lastMessageAt}
     * is null until a first message, and a brand-new conversation belongs at the
     * bottom of a list ordered by recency, not the top.
     */
    @Query("""
            SELECT thread
            FROM ChatThread thread
            WHERE thread.propertyId = :propertyId
              AND thread.kind = :kind
              AND thread.origin = :origin
            ORDER BY thread.lastMessageAt DESC NULLS LAST, thread.createdAt DESC
            """)
    List<ChatThread> findSection(
            UUID propertyId, ChatThreadKind kind, ChatThreadOrigin origin);

    /**
     * Every thread a person is a named member of, newest first.
     *
     * <p>The counterpart's own list. Not property-scoped: a user may have
     * enquired at several properties and rents at most one, and their screen
     * shows all of it together.
     */
    @Query("""
            SELECT thread
            FROM ChatThread thread
            WHERE thread.id IN (
                SELECT member.threadId
                FROM ChatThreadMember member
                WHERE member.userId = :userId
            )
            ORDER BY thread.lastMessageAt DESC NULLS LAST, thread.createdAt DESC
            """)
    List<ChatThread> findForMember(UUID userId);

    /** The enquiry threads one person answered, for their Enquiries section. */
    @Query("""
            SELECT thread
            FROM ChatThread thread
            WHERE thread.propertyId = :propertyId
              AND thread.origin = com.khatiyan.d_modules.chat.model.ChatThreadOrigin.ENQUIRY
              AND thread.id IN (
                SELECT member.threadId
                FROM ChatThreadMember member
                WHERE member.userId = :userId
              )
            ORDER BY thread.lastMessageAt DESC NULLS LAST, thread.createdAt DESC
            """)
    List<ChatThread> findEnquirySectionFor(UUID propertyId, UUID userId);
}
