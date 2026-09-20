package com.khatiyan.d_modules.food.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "food_subscriptions", schema = "food")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FoodSubscription extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "tenancy_id", nullable = false, updatable = false)
    private UUID tenancyId;

    @Column(name = "tenant_user_id", nullable = false, updatable = false)
    private UUID tenantUserId;

    @Column(name = "profile_id", nullable = false, updatable = false)
    private UUID profileId;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    @Column(name = "started_at", nullable = false, updatable = false)
    private Instant startedAt;

    @Column(name = "ended_at")
    private Instant endedAt;

    @Column(name = "end_reason", length = 120)
    private String endReason;

    private FoodSubscription(UUID propertyId, UUID tenancyId, UUID tenantUserId, UUID profileId) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.tenancyId = tenancyId;
        this.tenantUserId = tenantUserId;
        this.profileId = profileId;
        this.active = true;
        this.startedAt = Instant.now();
    }

    public static FoodSubscription start(
            UUID propertyId,
            UUID tenancyId,
            UUID tenantUserId,
            UUID profileId) {
        return new FoodSubscription(propertyId, tenancyId, tenantUserId, profileId);
    }

    public void end(String reason) {
        if (!active) {
            return;
        }
        this.active = false;
        this.endedAt = Instant.now();
        if (reason == null || reason.isBlank()) {
            this.endReason = null;
        } else {
            String normalized = reason.trim();
            this.endReason = normalized.length() > 120 ? normalized.substring(0, 120) : normalized;
        }
    }

    public boolean isCurrentlyActive() {
        return active;
    }
}
