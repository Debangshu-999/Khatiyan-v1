package com.khatiyan.d_modules.food.model;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import com.khatiyan.d_modules.property.model.MealType;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "food_items", schema = "food")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FoodItem extends BaseEntity {

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

    @Column(name = "image_url", length = 600)
    private String imageUrl;

    @Column(name = "image_public_id", length = 255)
    private String imagePublicId;

    @Enumerated(EnumType.STRING)
    @Column(name = "quantity_unit", nullable = false, length = 30)
    private FoodQuantityUnit quantityUnit;

    /**
     * The meals this dish belongs to.
     *
     * <p>A set, because roti is dinner AND breakfast. Forcing one meal per item
     * would mean the same dish entered twice under two names, and the forecast
     * would then cook it as two separate things.
     *
     * <p>EAGER because every read of an item is a read of its tags: the picker
     * filters on them, and the list prints them. Lazy here bought nothing and
     * cost a query per row.
     */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "food_item_meal_tags",
            schema = "food",
            joinColumns = @JoinColumn(name = "item_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "meal_type", nullable = false, length = 20)
    private Set<MealType> mealTags = EnumSet.noneOf(MealType.class);

    @Column(name = "is_active", nullable = false)
    private boolean active;

    /**
     * When the owner removed this item from their list.
     *
     * <p>Null for everything they can still see. Retiring an item and removing
     * it are two different acts: a retired item is off the menus but still
     * listed and recoverable, a removed one is gone from the app.
     *
     * <p>The row stays either way. `food_menu_entries` holds a foreign key to
     * this table, so deleting it outright would take a property's menu history
     * with it — and that history is what past forecasts were computed from.
     */
    @Column(name = "deleted_at")
    private Instant deletedAt;

    private FoodItem(
            UUID propertyId,
            UUID createdByUserId,
            String name,
            String description,
            String imageUrl,
            String imagePublicId,
            FoodQuantityUnit quantityUnit,
            Set<MealType> mealTags) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.createdByUserId = createdByUserId;
        update(name, description, imageUrl, imagePublicId, quantityUnit, mealTags);
        this.active = true;
    }

    public static FoodItem create(
            UUID propertyId,
            UUID createdByUserId,
            String name,
            String description,
            String imageUrl,
            String imagePublicId,
            FoodQuantityUnit quantityUnit,
            Set<MealType> mealTags) {
        return new FoodItem(
                propertyId, createdByUserId, name, description,
                imageUrl, imagePublicId, quantityUnit, mealTags);
    }

    public void update(
            String name,
            String description,
            String imageUrl,
            String imagePublicId,
            FoodQuantityUnit quantityUnit,
            Set<MealType> mealTags) {
        this.name = required(name, 100, "Food item name");
        this.description = optional(description, 500, "Food item description");
        this.imageUrl = optional(imageUrl, 600, "Food item image URL");
        this.imagePublicId = optional(imagePublicId, 255, "Food item image handle");
        if (quantityUnit == null) {
            throw new ValidationException("Food quantity unit is required");
        }
        this.quantityUnit = quantityUnit;

        // At least one, or the item matches no meal and is invisible in every
        // picker — present in the catalogue and impossible to put on a menu.
        if (mealTags == null || mealTags.isEmpty()) {
            throw new ValidationException("Choose at least one meal this item is served at");
        }
        // Replaced in place rather than reassigned: Hibernate tracks THIS
        // collection instance, and swapping it for a new EnumSet orphans the
        // one it is managing.
        this.mealTags.clear();
        this.mealTags.addAll(mealTags);
    }

    /** True when this dish is served at the given meal. */
    public boolean servedAt(MealType mealType) {
        return mealTags.contains(mealType);
    }

    public void deactivate() {
        this.active = false;
    }

    /**
     * Puts a retired item back on the list.
     *
     * <p>Refused for a removed one. Removal is the owner saying they are done
     * with it, and quietly resurrecting it from a screen that does not show it
     * would be a surprise.
     */
    public void reactivate() {
        if (deletedAt != null) {
            throw new ValidationException("This food item was removed and cannot be brought back");
        }
        this.active = true;
    }

    /** Hides a retired item from the owner's list for good. */
    public void markDeleted(Instant when) {
        if (active) {
            throw new ValidationException("Retire this food item before removing it");
        }
        this.deletedAt = when;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    public boolean isCurrentlyActive() {
        return active;
    }

    private static String required(String value, int max, String label) {
        String normalized = optional(value, max, label);
        if (normalized == null) {
            throw new ValidationException(label + " is required");
        }
        return normalized;
    }

    private static String optional(String value, int max, String label) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.length() > max) {
            throw new ValidationException(label + " is too long");
        }
        return normalized;
    }
}
