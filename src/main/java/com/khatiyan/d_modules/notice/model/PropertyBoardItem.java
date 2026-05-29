package com.khatiyan.d_modules.notice.model;

import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Semi-permanent dashboard information for a property.
 *
 * <p>Property board items hold operational facts such as gate timings, meal
 * timings, rules, contacts, facilities, and payment instructions. They are
 * property-scoped and remain separate from time-sensitive notices.
 */
@Entity
@Table(name = "property_board_items", schema = "notice")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PropertyBoardItem extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "created_by_user_id", nullable = false)
    private UUID createdByUserId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private PropertyBoardCategory category;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(nullable = false, length = 1000)
    private String body;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    private PropertyBoardItem(
            UUID propertyId,
            UUID createdByUserId,
            PropertyBoardCategory category,
            String title,
            String body,
            int displayOrder) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.createdByUserId = createdByUserId;
        this.category = category;
        this.title = title;
        this.body = body;
        this.displayOrder = displayOrder;
        this.active = true;
    }

    public static PropertyBoardItem create(
            UUID propertyId,
            UUID createdByUserId,
            PropertyBoardCategory category,
            String title,
            String body,
            int displayOrder) {
        return new PropertyBoardItem(
                propertyId,
                createdByUserId,
                category,
                title,
                body,
                displayOrder);
    }

    public void updateDetails(
            PropertyBoardCategory category,
            String title,
            String body,
            int displayOrder) {
        this.category = category;
        this.title = title;
        this.body = body;
        this.displayOrder = displayOrder;
    }

    public void deactivate() {
        this.active = false;
    }

    public boolean isCurrentlyActive() {
        return active;
    }
}
