package com.khatiyan.d_modules.discovery.model;

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
 * A manager the listing offers as a way to reach the property.
 *
 * <p>Selection, not permission: being listed here says a prospect may call this
 * person, and says nothing about what they can do inside the app. A manager can
 * be a contact without managing the listing, and can manage the listing without
 * being a contact.
 *
 * <p>The owner is never a row. Every property has exactly one, they are always
 * reachable, and giving the owner a row would allow a listing with no contact at
 * all — which is the one state a listing must not be in.
 */
@Entity
@Table(name = "property_contact_managers", schema = "discovery")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PropertyContactManager extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "manager_user_id", nullable = false, updatable = false)
    private UUID managerUserId;

    public static PropertyContactManager of(UUID propertyId, UUID managerUserId) {
        PropertyContactManager contact = new PropertyContactManager();
        contact.id = UUID.randomUUID();
        contact.propertyId = propertyId;
        contact.managerUserId = managerUserId;
        return contact;
    }
}
