package com.khatiyan.d_modules.property;

import java.util.UUID;
import java.util.List;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyBillingPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.service.PropertyManagerService;
import com.khatiyan.d_modules.property.service.PropertyService;
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

    public PropertyModule(
            RoomService roomService,
            PropertyService propertyService,
            PropertyManagerService propertyManagerService) {
        this.roomService = roomService;
        this.propertyService = propertyService;
        this.propertyManagerService = propertyManagerService;
    }

    public PropertyResponse getActiveProperty(UUID propertyId) {
        return propertyService.getActiveProperty(propertyId);
    }

    public PropertyBillingPolicyResponse getBillingPolicy(UUID propertyId) {
        return propertyService.getBillingPolicy(propertyId);
    }

    public RoomResponse getActiveRoom(UUID propertyId, UUID roomId) {
        return roomService.getActiveRoom(propertyId, roomId);
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

    public void handleTenancyRoomTransferred(UUID propertyId, UUID oldRoomId, UUID newRoomId) {
        roomService.handleTenancyEnded(propertyId, oldRoomId);
        roomService.handleTenancyStarted(propertyId, newRoomId);
    }
}
