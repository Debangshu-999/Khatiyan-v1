package com.khatiyan.d_modules.property.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.property.model.ManagerResource;

/**
 * Authorization chokepoint for the property workspace.
 *
 * <p>
 * Two resources, and neither offers a "blocked" state to the owner: a manager
 * who can see the property at all can read its settings and its rooms. The
 * choice is read-only or read-and-change, because a manager who cannot even
 * look at the room list cannot do the job the module exists for.
 *
 * <ul>
 *   <li>{@link ManagerResource#PROPERTY_SETTINGS} — the property's own details
 *       AND its public listing. They are one decision: the listing is just the
 *       outward-facing half of the same record, so splitting them would let an
 *       owner lock the details while leaving the shopfront editable.</li>
 *   <li>{@link ManagerResource#ROOMS} — room and bed inventory.</li>
 * </ul>
 */
@Component
public class PropertyAccessPolicy {

    private final ManagerAccessPolicy managerAccessPolicy;

    public PropertyAccessPolicy(ManagerAccessPolicy managerAccessPolicy) {
        this.managerAccessPolicy = managerAccessPolicy;
    }

    public void ensureCanViewSettings(UUID actorUserId, UUID propertyId) {
        managerAccessPolicy.ensureCanView(actorUserId, propertyId, ManagerResource.PROPERTY_SETTINGS);
    }

    /** Editing property details, and publishing or editing the listing. */
    public void ensureCanManageSettings(UUID actorUserId, UUID propertyId) {
        managerAccessPolicy.ensureCanManage(actorUserId, propertyId, ManagerResource.PROPERTY_SETTINGS);
    }

    public void ensureCanViewRooms(UUID actorUserId, UUID propertyId) {
        managerAccessPolicy.ensureCanView(actorUserId, propertyId, ManagerResource.ROOMS);
    }

    /** Creating, editing, deactivating a room, or changing its status. */
    public void ensureCanManageRooms(UUID actorUserId, UUID propertyId) {
        managerAccessPolicy.ensureCanManage(actorUserId, propertyId, ManagerResource.ROOMS);
    }
}
