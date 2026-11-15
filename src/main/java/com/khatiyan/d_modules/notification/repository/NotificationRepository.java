package com.khatiyan.d_modules.notification.repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.notification.model.Notification;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;

/**
 * Persistence access for notification content rows.
 */
@Repository
public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    @Query("""
        SELECT notification
        FROM Notification notification
        WHERE notification.id = :id
    """)
    Optional<Notification> findNotificationById(UUID id);

    /**
     * Whether a notice of this kind about this record went out since
     * {@code since}. Folds a burst of edits into one notice (food menu, 2026-11-08).
     */
    boolean existsBySubtypeAndSourceIdAndCreatedAtGreaterThanEqual(
            NotificationSubtype subtype, UUID sourceId, Instant since);
}
