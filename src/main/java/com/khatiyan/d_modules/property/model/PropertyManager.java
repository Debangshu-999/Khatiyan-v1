package com.khatiyan.d_modules.property.model;

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
 * Active manager assignment for a property.
 *
 * <p>Owners are linked directly through {@link Property#getOwnerId()}.
 * Managers are linked through this assignment table so one user can manage
 * selected properties without owning them.
 */
@Entity
@Table(name = "property_managers", schema = "property")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PropertyManager extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "manager_user_id", nullable = false)
    private UUID managerUserId;

    @Column(name = "assigned_by_user_id", nullable = false)
    private UUID assignedByUserId;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    private PropertyManager(UUID propertyId, UUID managerUserId, UUID assignedByUserId) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.managerUserId = managerUserId;
        this.assignedByUserId = assignedByUserId;
        this.active = true;
    }

    public static PropertyManager assign(UUID propertyId, UUID managerUserId, UUID assignedByUserId) {
        return new PropertyManager(propertyId, managerUserId, assignedByUserId);
    }

    public void deactivate() {
        this.active = false;
    }

    public boolean isCurrentlyActive() {
        return active;
    }
}
