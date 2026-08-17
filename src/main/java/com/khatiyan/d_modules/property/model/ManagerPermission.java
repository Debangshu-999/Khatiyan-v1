package com.khatiyan.d_modules.property.model;

import java.time.Instant;
import java.util.UUID;

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
 * One owner-granted permission: this manager, on this property, may use this
 * resource at this level.
 *
 * <p>
 * Only VIEW and MANAGE are ever stored. **Absence is NONE** — that is what makes
 * "existing managers start with nothing" true without a backfill, and it keeps
 * the table proportional to what was actually granted.
 */
@Entity
@Table(name = "manager_permissions", schema = "property")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ManagerPermission {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "manager_user_id", nullable = false)
    private UUID managerUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private ManagerResource resource;

    @Enumerated(EnumType.STRING)
    @Column(name = "access_level", nullable = false, length = 10)
    private ManagerAccessLevel accessLevel;

    @Column(name = "granted_by_user_id", nullable = false)
    private UUID grantedByUserId;

    @Column(name = "granted_at", nullable = false)
    private Instant grantedAt;

    private ManagerPermission(
            UUID propertyId,
            UUID managerUserId,
            ManagerResource resource,
            ManagerAccessLevel accessLevel,
            UUID grantedByUserId) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.managerUserId = managerUserId;
        this.resource = resource;
        this.accessLevel = accessLevel;
        this.grantedByUserId = grantedByUserId;
        this.grantedAt = Instant.now();
    }

    public static ManagerPermission grant(
            UUID propertyId,
            UUID managerUserId,
            ManagerResource resource,
            ManagerAccessLevel accessLevel,
            UUID grantedByUserId) {
        if (accessLevel == null || accessLevel == ManagerAccessLevel.NONE) {
            throw new IllegalArgumentException("NONE is represented by the absence of a row");
        }
        return new ManagerPermission(propertyId, managerUserId, resource, accessLevel, grantedByUserId);
    }

    public void changeLevel(ManagerAccessLevel accessLevel, UUID grantedByUserId) {
        if (accessLevel == null || accessLevel == ManagerAccessLevel.NONE) {
            throw new IllegalArgumentException("NONE is represented by the absence of a row");
        }
        this.accessLevel = accessLevel;
        this.grantedByUserId = grantedByUserId;
        this.grantedAt = Instant.now();
    }
}
