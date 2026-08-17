package com.khatiyan.d_modules.tenancy.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.ManagerResource;

/**
 * Authorization chokepoint for tenancy work.
 *
 * <p>
 * The owner-facing tenancy workspace is three separate decisions, so this is not
 * one resource:
 *
 * <ul>
 *   <li><b>Property stays</b> ({@link ManagerResource#TENANCIES}) — the
 *       active/past list, a tenant's profile, and ending a stay. View lets them
 *       look; manage lets them end one.</li>
 *   <li><b>Create tenancy</b> ({@link ManagerResource#TENANCY_CREATE}) —
 *       onboarding. Manage-only: there is nothing to "view" about creating.</li>
 *   <li><b>Exit requests</b> and <b>Room changes</b> — reviewing and deciding
 *       each queue.</li>
 * </ul>
 *
 * <p>
 * Tenant-initiated paths (requesting an exit or a room change, listing their own
 * requests) authorize on the tenant's own tenancy and must never come through
 * here — a tenant is not exercising a manager permission.
 */
@Component
public class TenancyAccessPolicy {

    private final PropertyModule propertyModule;

    public TenancyAccessPolicy(PropertyModule propertyModule) {
        this.propertyModule = propertyModule;
    }

    // --- Property stays ---

    public void ensureCanViewStays(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanView(actorUserId, propertyId, ManagerResource.TENANCIES);
    }

    /** Ending a stay, or changing its terms. */
    public void ensureCanManageStays(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.TENANCIES);
    }

    // --- Create tenancy ---

    public void ensureCanCreateTenancy(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.TENANCY_CREATE);
    }

    // --- Exit requests ---

    public void ensureCanViewExitRequests(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanView(actorUserId, propertyId, ManagerResource.EXIT_REQUESTS);
    }

    public void ensureCanManageExitRequests(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.EXIT_REQUESTS);
    }

    // --- Room changes ---

    public void ensureCanViewRoomChanges(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanView(actorUserId, propertyId, ManagerResource.ROOM_CHANGES);
    }

    public void ensureCanManageRoomChanges(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.ROOM_CHANGES);
    }
}
