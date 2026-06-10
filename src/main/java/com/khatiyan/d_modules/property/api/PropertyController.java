package com.khatiyan.d_modules.property.api;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.property.api.dto.AddPropertyManagerRequest;
import com.khatiyan.d_modules.property.api.dto.CreatePropertyRequest;
import com.khatiyan.d_modules.property.api.dto.CreateRoomBulkRequest;
import com.khatiyan.d_modules.property.api.dto.CreateRoomRequest;
import com.khatiyan.d_modules.property.api.dto.ManagerLookupResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyManagerResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.ShiftManagerRequest;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.api.dto.UpdatePropertyRequest;
import com.khatiyan.d_modules.property.api.dto.UpdateRoomRequest;
import com.khatiyan.d_modules.property.model.RoomStatus;
import com.khatiyan.d_modules.property.service.PropertyManagerService;
import com.khatiyan.d_modules.property.service.PropertyService;
import com.khatiyan.d_modules.property.service.RoomService;

import jakarta.validation.Valid;

/**
 * Owner-facing REST API for property and room management.
 *
 * <p>Role-level access is handled by {@code SecurityConfig}. This controller
 * stays thin and passes the authenticated owner id into the property module
 * services, where ownership checks are enforced.
 */
@RestController
@RequestMapping("/api/v1/properties")
@SuppressWarnings("null")
public class PropertyController {

    private final PropertyService propertyService;
    private final RoomService roomService;
    private final PropertyManagerService propertyManagerService;

    public PropertyController(
            PropertyService propertyService,
            RoomService roomService,
            PropertyManagerService propertyManagerService) {
        this.propertyService = propertyService;
        this.roomService = roomService;
        this.propertyManagerService = propertyManagerService;
    }

    @PostMapping
    public ResponseEntity<PropertyResponse> createProperty(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody CreatePropertyRequest request) {
        PropertyResponse response = propertyService.createProperty(user.userId(), request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/properties/" + response.id()))
                .body(response);
    }

    @GetMapping
    public List<PropertyResponse> listProperties(@AuthenticationPrincipal UserPrincipal user) {
        return propertyService.listManageableProperties(user.userId());
    }

    @GetMapping("/{propertyId}")
    public PropertyResponse getProperty(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return propertyService.getOwnerProperty(user.userId(), propertyId);
    }

    @PatchMapping("/{propertyId}")
    public PropertyResponse updateProperty(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody UpdatePropertyRequest request) {
        return propertyService.updateProperty(user.userId(), propertyId, request);
    }

    @DeleteMapping("/{propertyId}")
    public ResponseEntity<Void> deactivateProperty(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        propertyService.deactivateProperty(user.userId(), propertyId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{propertyId}/managers")
    public ResponseEntity<PropertyManagerResponse> addManager(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody AddPropertyManagerRequest request) {
        PropertyManagerResponse response = propertyManagerService.addManager(
                user.userId(),
                propertyId,
                request.phone(),
                request.fullName());

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/properties/" + propertyId + "/managers/" + response.managerUserId()))
                .body(response);
    }

    @GetMapping("/{propertyId}/managers/lookup")
    public ManagerLookupResponse lookupManager(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam String phone) {
        return propertyManagerService.lookupManager(user.userId(), propertyId, phone);
    }

    @GetMapping("/{propertyId}/managers")
    public List<PropertyManagerResponse> listManagers(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return propertyManagerService.listManagers(user.userId(), propertyId);
    }

    @PostMapping("/{propertyId}/managers/{managerUserId}/shift")
    public PropertyManagerResponse shiftManager(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID managerUserId,
            @Valid @RequestBody ShiftManagerRequest request) {
        return propertyManagerService.shiftManager(user.userId(), propertyId, managerUserId, request.targetPropertyId());
    }

    @DeleteMapping("/{propertyId}/managers/{managerUserId}")
    public ResponseEntity<Void> removeManager(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID managerUserId) {
        propertyManagerService.removeManager(user.userId(), propertyId, managerUserId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{propertyId}/rooms")
    public ResponseEntity<RoomResponse> createRoom(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody CreateRoomRequest request) {
        RoomResponse response = roomService.createRoom(user.userId(), propertyId, request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/properties/" + propertyId + "/rooms/" + response.id()))
                .body(response);
    }

    @PostMapping("/{propertyId}/rooms/bulk")
    public List<RoomResponse> createRoomsBulk(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody CreateRoomBulkRequest request) {
        return roomService.createRoomsBulk(user.userId(), propertyId, request);
    }

    @GetMapping("/{propertyId}/rooms")
    public List<RoomResponse> listRooms(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) RoomStatus status) {
        if (status == null) {
            return roomService.listRooms(user.userId(), propertyId);
        }

        return roomService.listRoomsByStatus(user.userId(), propertyId, status);
    }

    @PatchMapping("/{propertyId}/rooms/{roomId}/status")
    public RoomResponse markRoomStatus(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID roomId,
            @RequestParam RoomStatus status) {
        return roomService.markRoomStatus(user.userId(), propertyId, roomId, status);
    }

    @PatchMapping("/{propertyId}/rooms/{roomId}")
    public RoomResponse updateRoom(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID roomId,
            @Valid @RequestBody UpdateRoomRequest request) {
        return roomService.updateRoom(user.userId(), propertyId, roomId, request);
    }

    @DeleteMapping("/{propertyId}/rooms/{roomId}")
    public ResponseEntity<Void> deactivateRoom(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID roomId) {
        roomService.deactivateRoom(user.userId(), propertyId, roomId);
        return ResponseEntity.noContent().build();
    }
}
