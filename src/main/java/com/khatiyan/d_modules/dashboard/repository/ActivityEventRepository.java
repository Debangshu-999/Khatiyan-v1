package com.khatiyan.d_modules.dashboard.repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.khatiyan.d_modules.dashboard.api.dto.RecentActivityType;
import com.khatiyan.d_modules.dashboard.model.ActivityEvent;

public interface ActivityEventRepository extends JpaRepository<ActivityEvent, UUID> {

    /**
     * Newest first for one property, within the retention window. Bounded twice
     * over — by {@code since} and by the page size — because the feed is a
     * window on recent activity, never the whole history.
     */
    @Query("""
        SELECT event
        FROM ActivityEvent event
        WHERE event.propertyId = :propertyId
          AND event.occurredAt >= :since
        ORDER BY event.occurredAt DESC
        """)
    List<ActivityEvent> findRecentByPropertyId(UUID propertyId, Instant since, Pageable pageable);

    /**
     * Guards against a redelivered domain event writing the row twice. Listeners
     * are at-least-once, so this is checked before every insert that has a
     * subject to key on.
     */
    boolean existsByPropertyIdAndTypeAndSubjectIdAndOccurredAt(
            UUID propertyId,
            RecentActivityType type,
            UUID subjectId,
            Instant occurredAt);
}
