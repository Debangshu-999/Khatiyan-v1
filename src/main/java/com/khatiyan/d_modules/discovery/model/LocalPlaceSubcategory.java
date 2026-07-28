package com.khatiyan.d_modules.discovery.model;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "local_place_subcategories", schema = "discovery")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LocalPlaceSubcategory {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "category_id", nullable = false)
    private UUID categoryId;

    @Column(nullable = false, length = 60)
    private String slug;

    @Column(nullable = false, length = 80)
    private String name;

    /** Comma-separated synonyms; empty for owner-custom rows. */
    @Column(nullable = false)
    private String keywords = "";

    @Column(name = "is_custom", nullable = false)
    private boolean custom;

    /** NULL for global curated rows; set for owner-custom rows. */
    @Column(name = "property_id")
    private UUID propertyId;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    private LocalPlaceSubcategory(UUID categoryId, String name, UUID propertyId) {
        this.id = UUID.randomUUID();
        this.categoryId = categoryId;
        this.name = name;
        this.slug = "custom-" + this.id;
        this.keywords = "";
        this.custom = true;
        this.propertyId = propertyId;
        this.displayOrder = 1000;
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    /** Factory for an owner-custom subcategory under a curated category. */
    public static LocalPlaceSubcategory custom(UUID categoryId, String name, UUID propertyId) {
        return new LocalPlaceSubcategory(categoryId, name, propertyId);
    }
}
