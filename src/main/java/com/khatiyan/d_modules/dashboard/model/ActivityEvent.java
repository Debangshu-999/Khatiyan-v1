package com.khatiyan.d_modules.dashboard.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.dashboard.api.dto.RecentActivityType;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One thing that happened, recorded as a fact.
 *
 * <p>
 * Append-only. Nothing here is ever recomputed or corrected — the feed's whole
 * purpose is to survive changes to the thing it describes, which the previous
 * state-derived implementation could not do.
 */
@Entity
@Table(name = "activity_events", schema = "dashboard")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ActivityEvent {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 48)
    private RecentActivityType type;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 300)
    private String subtitle;

    @Column(name = "actor_user_id")
    private UUID actorUserId;

    @Column(name = "subject_id")
    private UUID subjectId;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    private ActivityEvent(
            UUID propertyId,
            RecentActivityType type,
            String title,
            String subtitle,
            UUID actorUserId,
            UUID subjectId,
            Instant occurredAt) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.type = type;
        this.title = title;
        this.subtitle = subtitle;
        this.actorUserId = actorUserId;
        this.subjectId = subjectId;
        this.occurredAt = occurredAt != null ? occurredAt : Instant.now();
        this.createdAt = Instant.now();
    }

    public static ActivityEvent record(
            UUID propertyId,
            RecentActivityType type,
            String title,
            String subtitle,
            UUID actorUserId,
            UUID subjectId,
            Instant occurredAt) {
        return new ActivityEvent(propertyId, type, title, subtitle, actorUserId, subjectId, occurredAt);
    }
}
