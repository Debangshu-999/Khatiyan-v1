package com.khatiyan.d_modules.notification.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.notification.model.NotificationRecipient;

/**
 * Persistence access for per-user notification inbox state.
 */
@Repository
public interface NotificationRecipientRepository extends JpaRepository<NotificationRecipient, UUID> {

    /**
     * Loads the current inbox for a user.
     *
     * <p>Archived rows are hidden from the default notification tab, and the
     * notification content is fetched in the same query to avoid lazy-loading
     * problems while building API responses.
     */
    @Query("""
        SELECT recipient
        FROM NotificationRecipient recipient
        JOIN FETCH recipient.notification notification
        WHERE recipient.userId = :userId
          AND recipient.archivedAt IS NULL
        ORDER BY recipient.createdAt DESC
    """)
    List<NotificationRecipient> findVisibleByUserId(UUID userId);

    /**
     * Loads visible notifications for a user created on or after the given
     * instant. Used by the tenancy-scoped feed: callers compute the floor
     * (active tenancy start, or epoch for owners) and pass it in.
     */
    @Query("""
        SELECT recipient
        FROM NotificationRecipient recipient
        JOIN FETCH recipient.notification notification
        WHERE recipient.userId = :userId
          AND recipient.archivedAt IS NULL
          AND recipient.createdAt >= :since
        ORDER BY recipient.createdAt DESC
    """)
    List<NotificationRecipient> findVisibleByUserIdSince(UUID userId, Instant since);

    /**
     * Loads visible notifications for a user created on or after the floor
     * AND strictly before the upper bound. Used for the "recent" bucket
     * (since-floor to now) and the "older" bucket (floor to cutoff).
     */
    @Query("""
        SELECT recipient
        FROM NotificationRecipient recipient
        JOIN FETCH recipient.notification notification
        WHERE recipient.userId = :userId
          AND recipient.archivedAt IS NULL
          AND recipient.createdAt >= :since
          AND recipient.createdAt < :until
        ORDER BY recipient.createdAt DESC
    """)
    List<NotificationRecipient> findVisibleByUserIdBetween(UUID userId, Instant since, Instant until);

    /**
     * Counts unread, non-archived notifications for the user since the given
     * floor. Used by the tenancy-scoped bell badge.
     */
    @Query("""
        SELECT COUNT(recipient)
        FROM NotificationRecipient recipient
        WHERE recipient.userId = :userId
          AND recipient.readAt IS NULL
          AND recipient.archivedAt IS NULL
          AND recipient.createdAt >= :since
    """)
    long countUnreadByUserIdSince(UUID userId, Instant since);

    /**
     * Loads one notification recipient row only if it belongs to the user.
     *
     * <p>This is used before user actions such as mark-read/archive so one user
     * cannot mutate another user's notification state.
     */
    @Query("""
        SELECT recipient
        FROM NotificationRecipient recipient
        JOIN FETCH recipient.notification notification
        WHERE recipient.id = :recipientId
          AND recipient.userId = :userId
    """)
    Optional<NotificationRecipient> findRecipientForUser(UUID recipientId, UUID userId);

    /**
     * Counts visible unread notifications for the user badge/counter.
     */
    @Query("""
        SELECT COUNT(recipient)
        FROM NotificationRecipient recipient
        WHERE recipient.userId = :userId
          AND recipient.readAt IS NULL
          AND recipient.archivedAt IS NULL
    """)
    long countUnreadByUserId(UUID userId);

    /**
     * Finds old read notifications that can be archived by cleanup.
     *
     * <p>Read rows are safe to hide earlier because the user has already seen
     * them in the in-app notification tab.
     */
    @Query("""
        SELECT recipient
        FROM NotificationRecipient recipient
        WHERE recipient.readAt IS NOT NULL
          AND recipient.readAt < :now
          AND recipient.archivedAt IS NULL
        ORDER BY recipient.readAt ASC
    """)
    List<NotificationRecipient> findReadBeforeForArchival(Instant now);

    /**
     * Finds very old unread notifications that can be archived by cleanup.
     *
     * <p>Unread rows are kept longer than read rows, but still need retention
     * cleanup so the inbox table does not grow forever.
     */
    @Query("""
        SELECT recipient
        FROM NotificationRecipient recipient
        WHERE recipient.readAt IS NULL
          AND recipient.createdAt < :now
          AND recipient.archivedAt IS NULL
        ORDER BY recipient.createdAt ASC
    """)
    List<NotificationRecipient> findUnreadBeforeForArchival(Instant now);
}
