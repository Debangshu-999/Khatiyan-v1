package com.khatiyan.d_modules.property.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

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
 * An append-only record of a single room lifecycle action (maintenance on/off,
 * deactivate/reactivate). Powers the owner dashboard recent-activity feed with
 * one independent row per action.
 */
@Entity
@Table(name = "room_activities", schema = "property")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RoomActivity extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "room_id", nullable = false)
    private UUID roomId;

    @Column(name = "room_number", nullable = false, length = 40)
    private String roomNumber;

    @Enumerated(EnumType.STRING)
    @Column(name = "activity_type", nullable = false, length = 40)
    private RoomActivityType activityType;

    @Column(length = 280)
    private String reason;

    @Column(name = "actor_user_id")
    private UUID actorUserId;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    private RoomActivity(
            UUID propertyId,
            UUID roomId,
            String roomNumber,
            RoomActivityType activityType,
            String reason,
            UUID actorUserId,
            Instant occurredAt) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.roomId = roomId;
        this.roomNumber = roomNumber;
        this.activityType = activityType;
        this.reason = reason;
        this.actorUserId = actorUserId;
        this.occurredAt = occurredAt;
    }

    public static RoomActivity record(
            UUID propertyId,
            UUID roomId,
            String roomNumber,
            RoomActivityType activityType,
            String reason,
            UUID actorUserId,
            Instant occurredAt) {
        return new RoomActivity(propertyId, roomId, roomNumber, activityType, reason, actorUserId, occurredAt);
    }
}
