package com.khatiyan.d_modules.notice.model;

import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Property-scoped grouping for notice board items.
 *
 * <p>Categories are data-driven so owners can add sections such as Visitors,
 * Food, Wi-Fi, or Parking without a code release.
 */
@Entity
@Table(name = "property_board_categories", schema = "notice")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PropertyBoardCategory extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "created_by_user_id", nullable = false)
    private UUID createdByUserId;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(nullable = false, length = 80)
    private String slug;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    private PropertyBoardCategory(
            UUID propertyId,
            UUID createdByUserId,
            String name,
            String slug,
            int displayOrder) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.createdByUserId = createdByUserId;
        this.name = name;
        this.slug = slug;
        this.displayOrder = displayOrder;
        this.active = true;
    }

    public static PropertyBoardCategory create(
            UUID propertyId,
            UUID createdByUserId,
            String name,
            String slug,
            int displayOrder) {
        return new PropertyBoardCategory(
                propertyId,
                createdByUserId,
                name,
                slug,
                displayOrder);
    }

    public void updateDetails(String name, String slug, int displayOrder) {
        this.name = name;
        this.slug = slug;
        this.displayOrder = displayOrder;
    }

    public void deactivate() {
        this.active = false;
    }

    public boolean isCurrentlyActive() {
        return active;
    }
}
