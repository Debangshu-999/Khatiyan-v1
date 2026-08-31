package com.khatiyan.d_modules.property;

import java.util.Collection;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.c_shared.employment.ManagerEmploymentDetails;
import com.khatiyan.d_modules.property.api.dto.ManagerEmploymentResponse;
import com.khatiyan.d_modules.property.api.dto.ManagerPayrollView;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyBillingPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyExitPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomActivityResponse;
import com.khatiyan.d_modules.property.api.dto.RoomMoldResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.service.PropertyManagerService;
import com.khatiyan.d_modules.property.api.dto.ManagerPermissionsResponse;
import com.khatiyan.d_modules.property.model.ManagerAccessLevel;
import com.khatiyan.d_modules.property.model.ManagerResource;
import com.khatiyan.d_modules.property.service.ManagerAccessPolicy;
import com.khatiyan.d_modules.property.service.PropertyService;
import com.khatiyan.d_modules.property.service.RoomMoldService;
import com.khatiyan.d_modules.property.service.RoomService;

/**
 * Public facade for the property module.
 *
 * <p>Other modules should use this facade instead of importing property
 * repositories, services, or entities directly. It exposes stable module
 * operations such as room vacancy checks and tenancy lifecycle reactions.
 */
@Component
public class PropertyModule {

    private final RoomService roomService;
    private final PropertyService propertyService;
    private final PropertyManagerService propertyManagerService;
    private final ManagerAccessPolicy managerAccessPolicy;
    private final RoomMoldService roomMoldService;

    public PropertyModule(
            RoomService roomService,
            PropertyService propertyService,
            PropertyManagerService propertyManagerService,
            ManagerAccessPolicy managerAccessPolicy,
            RoomMoldService roomMoldService) {
        this.roomService = roomService;
        this.propertyService = propertyService;
        this.propertyManagerService = propertyManagerService;
        this.managerAccessPolicy = managerAccessPolicy;
        this.roomMoldService = roomMoldService;
    }

    public PropertyResponse getActiveProperty(UUID propertyId) {
        return propertyService.getActiveProperty(propertyId);
    }

    public List<PropertyResponse> listActiveProperties() {
        return propertyService.listActiveProperties();
    }

    public List<PropertyResponse> listOwnerProperties(UUID ownerId) {
        return propertyService.listOwnerProperties(ownerId);
    }

    public PropertyBillingPolicyResponse getBillingPolicy(UUID propertyId) {
        return propertyService.getBillingPolicy(propertyId);
    }

    /**
     * A property's exit policies (damage-charge schedule + move-out checklist),
     * read by the compliance agreement assembler and by deposit settlement.
     */
    public PropertyExitPolicyResponse getExitPolicy(UUID propertyId) {
        return propertyService.getExitPolicy(propertyId);
    }

    public RoomResponse getActiveRoom(UUID propertyId, UUID roomId) {
        return roomService.getActiveRoom(propertyId, roomId);
    }

    public Optional<RoomResponse> findRoomForDisplay(UUID propertyId, UUID roomId) {
        return roomService.findRoomForDisplay(propertyId, roomId);
    }

    public Map<UUID, RoomResponse> findRoomsForDisplay(UUID propertyId, Collection<UUID> roomIds) {
        return roomService.findRoomsForDisplay(propertyId, roomIds);
    }

    /**
     * Active rooms for a property the actor manages. Used by the owner action
     * center to compute the occupancy snapshot (beds, occupied, vacant).
     */
    public List<RoomResponse> listRooms(UUID actorUserId, UUID propertyId) {
        return roomService.listRooms(actorUserId, propertyId);
    }

    /**
     * Most recent room lifecycle actions (maintenance on/off, deactivate /
     * reactivate) for a property the actor manages. Each action is an
     * independent entry. Used by the dashboard recent-activity feed.
     */
    public List<RoomActivityResponse> listRecentRoomActivities(UUID actorUserId, UUID propertyId, int limit) {
        return roomService.listRecentRoomActivities(actorUserId, propertyId, limit);
    }

    /**
     * Active rooms for tenant-side views after tenancy has scoped the property.
     */
    public List<RoomResponse> listActiveRoomsForProperty(UUID propertyId) {
        return roomService.listActiveRoomsForProperty(propertyId);
    }

    public Long findLowestActiveRoomRentPaise(UUID propertyId) {
        return roomService.findLowestActiveRoomRentPaise(propertyId);
    }

    /** The room types a property offers, for its public listing. */
    public List<RoomMoldResponse> listPublicRoomTypes(UUID propertyId) {
        return roomMoldService.listPublicTypes(propertyId);
    }

    public void ensureCanManageProperty(UUID actorUserId, UUID propertyId) {
        propertyManagerService.ensureCanManageProperty(actorUserId, propertyId);
    }

    public void markDiscoveryProfileCreated(UUID propertyId) {
        propertyService.markDiscoveryProfileCreated(propertyId);
    }

    public List<UUID> findActiveManagerUserIds(UUID propertyId) {
        return propertyManagerService.findActiveManagerUserIds(propertyId);
    }

    // Manager employment is owned here (on the property_managers row); the staff
    // workspace reads and edits it through these facade methods.

    public List<ManagerEmploymentResponse> listManagerEmployment(UUID propertyId) {
        return propertyManagerService.listManagerEmployment(propertyId);
    }

    /** Active manager payroll terms across every property, for scheduled payroll jobs. */
    public List<ManagerPayrollView> listActiveManagerPayroll() {
        return propertyManagerService.listActiveManagerPayroll();
    }

    public ManagerEmploymentResponse getManagerEmploymentByReference(UUID propertyId, String referenceCode) {
        return propertyManagerService.getManagerEmploymentByReference(propertyId, referenceCode);
    }

    public ManagerEmploymentResponse getManagerEmploymentById(UUID propertyManagerId) {
        return propertyManagerService.getManagerEmploymentById(propertyManagerId);
    }

    public ManagerEmploymentResponse getManagerEmploymentByUser(UUID propertyId, UUID managerUserId) {
        return propertyManagerService.getManagerEmploymentByUser(propertyId, managerUserId);
    }

    public ManagerEmploymentResponse updateManagerEmployment(
            UUID actorUserId,
            UUID propertyId,
            String referenceCode,
            ManagerEmploymentDetails employment) {
        return propertyManagerService.updateManagerEmployment(actorUserId, propertyId, referenceCode, employment);
    }

    public void endManagerEmployment(UUID ownerId, UUID propertyId, UUID managerUserId, String reason, String review) {
        propertyManagerService.endManagerEmployment(ownerId, propertyId, managerUserId, reason, review);
    }

    /** Ends every manager assignment whose scheduled last day has arrived. */
    public int endDueScheduledManagerAssignments(LocalDate today) {
        return propertyManagerService.endDueScheduledAssignments(today);
    }

    /** Records a future leaving date; the assignment stays live until then. */
    public void scheduleManagerEnd(
            UUID ownerId, UUID propertyId, UUID managerUserId, LocalDate endDate, String reason, String review) {
        propertyManagerService.scheduleManagerEnd(ownerId, propertyId, managerUserId, endDate, reason, review);
    }

    public List<ManagerEmploymentResponse> listEndedManagerEmployment(UUID propertyId) {
        return propertyManagerService.listEndedManagerEmployment(propertyId);
    }

    public boolean hasAvailableVacancy(UUID propertyId, UUID roomId) {
        return roomService.hasAvailableVacancy(propertyId, roomId);
    }

    public int getAvailableVacancies(UUID propertyId, UUID roomId) {
        return roomService.getAvailableVacancies(propertyId, roomId);
    }

    public void handleTenancyStarted(UUID propertyId, UUID roomId) {
        roomService.handleTenancyStarted(propertyId, roomId);
    }

    public void handleTenancyEnded(UUID propertyId, UUID roomId) {
        roomService.handleTenancyEnded(propertyId, roomId);
    }

    /** Holds a bed on the target room of an approved room change. */
    // ----- Manager permissions -----

    /** What this actor may do on this property, resource by resource. */
    public ManagerPermissionsResponse permissionsFor(UUID actorUserId, UUID propertyId) {
        return new ManagerPermissionsResponse(
                propertyId,
                actorUserId,
                // Owner iff they hold MANAGE without any grant existing — the policy
                // owns that rule, so it is asked rather than re-derived here.
                managerAccessPolicy.isOwner(actorUserId, propertyId),
                managerAccessPolicy.levelsFor(actorUserId, propertyId));
    }

    /** The grants an owner has given one manager, for the permission screen. */
    public ManagerPermissionsResponse managerGrants(UUID ownerUserId, UUID propertyId, UUID managerUserId) {
        managerAccessPolicy.ensureOwner(ownerUserId, propertyId);
        return new ManagerPermissionsResponse(
                propertyId,
                managerUserId,
                false,
                managerAccessPolicy.grantsFor(propertyId, managerUserId));
    }

    public ManagerPermissionsResponse replaceManagerGrants(
            UUID ownerUserId,
            UUID propertyId,
            UUID managerUserId,
            Map<ManagerResource, ManagerAccessLevel> levels) {
        managerAccessPolicy.replaceGrants(ownerUserId, propertyId, managerUserId, levels);
        return new ManagerPermissionsResponse(
                propertyId,
                managerUserId,
                false,
                managerAccessPolicy.grantsFor(propertyId, managerUserId));
    }

    public ManagerAccessLevel accessLevel(UUID actorUserId, UUID propertyId, ManagerResource resource) {
        return managerAccessPolicy.levelFor(actorUserId, propertyId, resource);
    }

    public void ensureCanView(UUID actorUserId, UUID propertyId, ManagerResource resource) {
        managerAccessPolicy.ensureCanView(actorUserId, propertyId, resource);
    }

    /** Passes if the actor can view ANY of the resources. Reads only. */
    public void ensureCanViewAny(UUID actorUserId, UUID propertyId, ManagerResource... resources) {
        managerAccessPolicy.ensureCanViewAny(actorUserId, propertyId, resources);
    }

    public void ensureCanManage(UUID actorUserId, UUID propertyId, ManagerResource resource) {
        managerAccessPolicy.ensureCanManage(actorUserId, propertyId, resource);
    }

    public void reserveRoomSlot(UUID propertyId, UUID roomId) {
        roomService.reserveSlot(propertyId, roomId);
    }

    /** Releases a bed held for a room change that executed or can no longer run. */
    public void releaseRoomSlotReservation(UUID propertyId, UUID roomId) {
        roomService.releaseReservedSlot(propertyId, roomId);
    }

    public void handleTenancyRoomTransferred(UUID propertyId, UUID oldRoomId, UUID newRoomId) {
        roomService.handleTenancyEnded(propertyId, oldRoomId);
        roomService.handleTenancyStarted(propertyId, newRoomId);
    }
}
