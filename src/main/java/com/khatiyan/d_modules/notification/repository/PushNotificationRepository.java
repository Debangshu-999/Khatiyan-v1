package com.khatiyan.d_modules.notification.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.notification.model.PushNotification;

/**
 * Persistence access for durable push delivery jobs.
 *
 * <p>The native claim query uses PostgreSQL {@code FOR UPDATE SKIP LOCKED} so
 * multiple scheduler workers do not claim the same push row.
 */
@Repository
public interface PushNotificationRepository extends JpaRepository<PushNotification, UUID> {

    @Query("""
        SELECT pushNotification
        FROM PushNotification pushNotification
        WHERE pushNotification.id = :id
    """)
    Optional<PushNotification> findPushNotificationById(UUID id);

    @Query(
        value = """
            SELECT *
            FROM notification.push_notifications push_notification
            WHERE (
                push_notification.status = 'PENDING'
                AND push_notification.next_attempt_at <= :now
            )
            OR (
                push_notification.status = 'IN_PROGRESS'
                AND push_notification.locked_at < :staleBefore
            )
            ORDER BY push_notification.created_at ASC
            LIMIT :batchSize
            FOR UPDATE SKIP LOCKED
        """,
        nativeQuery = true)
    List<PushNotification> findClaimableForUpdate(
            @Param("now") Instant now,
            @Param("staleBefore") Instant staleBefore,
            @Param("batchSize") int batchSize);
}
