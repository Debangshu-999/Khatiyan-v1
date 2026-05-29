package com.khatiyan.d_modules.notification.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.notification.model.Notification;

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
}
