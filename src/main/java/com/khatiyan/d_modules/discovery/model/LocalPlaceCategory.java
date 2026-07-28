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
@Table(name = "local_place_categories", schema = "discovery")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LocalPlaceCategory {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(nullable = false, length = 60)
    private String slug;

    @Column(nullable = false, length = 60)
    private String name;

    @Column(name = "is_custom", nullable = false)
    private boolean custom;

    /** NULL for global curated categories; set for owner-custom ones. */
    @Column(name = "property_id")
    private UUID propertyId;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    private LocalPlaceCategory(String name, UUID propertyId) {
        this.id = UUID.randomUUID();
        this.name = name;
        this.slug = "custom-" + this.id;
        this.custom = true;
        this.propertyId = propertyId;
        this.displayOrder = 1000;
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    /** Factory for an owner-custom top-level category. */
    public static LocalPlaceCategory custom(String name, UUID propertyId) {
        return new LocalPlaceCategory(name, propertyId);
    }
}
