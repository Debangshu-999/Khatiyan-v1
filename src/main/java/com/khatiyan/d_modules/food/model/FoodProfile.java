package com.khatiyan.d_modules.food.model;

import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "food_profiles", schema = "food")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FoodProfile extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "created_by_user_id", nullable = false, updatable = false)
    private UUID createdByUserId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 500)
    private String description;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    private FoodProfile(
            UUID propertyId,
            UUID createdByUserId,
            String name,
            String description,
            int displayOrder) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.createdByUserId = createdByUserId;
        update(name, description, displayOrder);
        this.active = true;
    }

    public static FoodProfile create(
            UUID propertyId,
            UUID createdByUserId,
            String name,
            String description,
            int displayOrder) {
        return new FoodProfile(propertyId, createdByUserId, name, description, displayOrder);
    }

    public void update(String name, String description, int displayOrder) {
        if (name == null || name.isBlank()) {
            throw new ValidationException("Food profile name is required");
        }
        String normalizedName = name.trim();
        if (normalizedName.length() > 100) {
            throw new ValidationException("Food profile name is too long");
        }
        if (displayOrder < 0) {
            throw new ValidationException("Food profile display order cannot be negative");
        }
        this.name = normalizedName;
        this.description = normalizeDescription(description);
        this.displayOrder = displayOrder;
    }

    public void deactivate() {
        this.active = false;
    }

    public boolean isCurrentlyActive() {
        return active;
    }

    private static String normalizeDescription(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.length() > 500) {
            throw new ValidationException("Food profile description is too long");
        }
        return normalized;
    }
}
