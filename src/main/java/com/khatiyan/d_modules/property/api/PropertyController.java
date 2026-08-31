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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.d_modules.property.api.dto.CreateRoomsFromMoldRequest;
import com.khatiyan.d_modules.property.api.dto.RecutRoomRequest;
import com.khatiyan.d_modules.property.api.dto.RoomMoldResponse;
import com.khatiyan.d_modules.property.api.dto.SaveRoomMoldRequest;
import com.khatiyan.d_modules.property.api.dto.UpdateRoomAmenitiesRequest;
import com.khatiyan.d_modules.property.service.RoomMoldService;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.property.api.dto.AddPropertyManagerRequest;
import com.khatiyan.d_modules.property.api.dto.CreatePropertyRequest;
import com.khatiyan.d_modules.property.api.dto.CreateRoomBulkRequest;
import com.khatiyan.d_modules.property.api.dto.CreateRoomRequest;
import com.khatiyan.d_modules.property.api.dto.ManagerLookupResponse;
import com.khatiyan.d_modules.property.api.dto.MarkRoomStatusRequest;
import com.khatiyan.d_modules.property.api.dto.PropertyExitPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyManagerResponse;
import com.khatiyan.d_modules.property.api.dto.ManagerPermissionsResponse;
import com.khatiyan.d_modules.property.api.dto.UpdateManagerPermissionsRequest;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.ShiftManagerRequest;
import com.khatiyan.d_modules.property.api.dto.UpdatePrematureExitPolicyRequest;
import com.khatiyan.d_modules.property.api.dto.UpdatePropertyExitPolicyRequest;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.api.dto.UpdatePropertyRequest;
import com.khatiyan.d_modules.property.api.dto.UpdateRoomMaintenanceRequest;
import com.khatiyan.d_modules.property.api.dto.UpdateRoomRequest;
import com.khatiyan.d_modules.property.model.ManagerResource;
import com.khatiyan.d_modules.property.model.RoomStatus;
import com.khatiyan.d_modules.property.service.ManagerAccessPolicy;
import com.khatiyan.d_modules.property.service.PropertyAccessPolicy;
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
    private final RoomMoldService roomMoldService;
    private final PropertyManagerService propertyManagerService;
    private final ManagerAccessPolicy managerAccessPolicy;
    private final PropertyAccessPolicy propertyAccessPolicy;

    public PropertyController(
            PropertyService propertyService,
            RoomService roomService,
            RoomMoldService roomMoldService,
            PropertyManagerService propertyManagerService,
            ManagerAccessPolicy managerAccessPolicy,
            PropertyAccessPolicy propertyAccessPolicy) {
        this.propertyService = propertyService;
        this.roomService = roomService;
        this.roomMoldService = roomMoldService;
        this.propertyManagerService = propertyManagerService;
        this.managerAccessPolicy = managerAccessPolicy;
        this.propertyAccessPolicy = propertyAccessPolicy;
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
        // PROPERTY_SETTINGS at MANAGE, not owner-only. Editing the property is
        // exactly what the permission exists to grant; leaving it owner-scoped
        // would make "view & manage" mean nothing on this screen.
        propertyAccessPolicy.ensureCanManageSettings(user.userId(), propertyId);
        return propertyService.updateProperty(user.userId(), propertyId, request);
    }

    @DeleteMapping("/{propertyId}")
    public ResponseEntity<Void> deactivateProperty(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        propertyService.deactivateProperty(user.userId(), propertyId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{propertyId}/exit-policies")
    public PropertyExitPolicyResponse getExitPolicies(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        // Exit policies are the rules a stay ends under, so they are EDITED
        // under TENANCY_RULES rather than property configuration — the owner
        // sets those and agreement settings in one decision. Reading them is
        // wider: ending a stay and settling a deposit both need the damage
        // schedule and checklist.
        managerAccessPolicy.ensureCanViewAny(
                user.userId(),
                propertyId,
                ManagerResource.TENANCY_RULES,
                ManagerResource.TENANCIES,
                ManagerResource.DEPOSITS);
        return propertyService.getExitPolicy(propertyId);
    }

    @PatchMapping("/{propertyId}/exit-policies")
    public PropertyExitPolicyResponse updateExitPolicies(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody UpdatePropertyExitPolicyRequest request) {
        managerAccessPolicy.ensureCanManage(user.userId(), propertyId, ManagerResource.TENANCY_RULES);
        return propertyService.updateExitPolicies(user.userId(), propertyId, request);
    }

    /**
     * The premature-exit policy alone, edited from the agreement screen.
     *
     * <p>Its own endpoint rather than a field on the exit-policy update, because
     * that one REPLACES every policy it carries — damage schedule, checklist,
     * deductions. Writing this one field through it from a screen that holds none
     * of the others would clear all three the moment somebody saved.
     *
     * <p>It moved to the agreement screen because it belongs beside the term: it
     * is what an indefinite agreement charges for leaving without notice, and
     * splitting the two halves of "how does this tenancy end" across two screens
     * meant neither read as a whole rule.
     */
    @PatchMapping("/{propertyId}/premature-exit-policy")
    public PropertyExitPolicyResponse updatePrematureExitPolicy(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody UpdatePrematureExitPolicyRequest request) {
        managerAccessPolicy.ensureCanManage(user.userId(), propertyId, ManagerResource.TENANCY_RULES);
        return propertyService.updatePrematureExitPolicy(user.userId(), propertyId, request.prematureExitPolicy());
    }

    @PostMapping("/{propertyId}/managers")
    public ResponseEntity<PropertyManagerResponse> addManager(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody AddPropertyManagerRequest request) {
        PropertyManagerResponse response = propertyManagerService.addManager(
                user.userId(),
                propertyId,
                request);

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

    /**
     * What the CALLER may see and do here. Every authenticated user of the
     * property can read their own map — it is what the app uses to decide which
     * sections to render at all, so refusing it would just blank the UI.
     */
    @GetMapping("/{propertyId}/my-permissions")
    public ManagerPermissionsResponse myPermissions(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return new ManagerPermissionsResponse(
                propertyId,
                user.userId(),
                managerAccessPolicy.isOwner(user.userId(), propertyId),
                managerAccessPolicy.levelsFor(user.userId(), propertyId));
    }

    /** One manager's grants. Owner-only: this is the permission screen. */
    @GetMapping("/{propertyId}/managers/{managerUserId}/permissions")
    public ManagerPermissionsResponse managerPermissions(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID managerUserId) {
        managerAccessPolicy.ensureOwner(user.userId(), propertyId);
        return new ManagerPermissionsResponse(
                propertyId,
                managerUserId,
                false,
                managerAccessPolicy.grantsFor(propertyId, managerUserId));
    }

    /**
     * Replaces a manager's grants. Owner-only, and deliberately a full
     * replacement — anything omitted is revoked.
     */
    @PutMapping("/{propertyId}/managers/{managerUserId}/permissions")
    public ManagerPermissionsResponse replaceManagerPermissions(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID managerUserId,
            @Valid @RequestBody UpdateManagerPermissionsRequest request) {
        managerAccessPolicy.replaceGrants(user.userId(), propertyId, managerUserId, request.levels());
        return new ManagerPermissionsResponse(
                propertyId,
                managerUserId,
                false,
                managerAccessPolicy.grantsFor(propertyId, managerUserId));
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

    // ------------------------------------------------------------------
    // Room molds — the shapes rooms are cut from
    // ------------------------------------------------------------------

    @GetMapping("/{propertyId}/room-molds")
    public List<RoomMoldResponse> listRoomMolds(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false, defaultValue = "false") boolean includeRetired) {
        return roomMoldService.list(user.userId(), propertyId, includeRetired);
    }

    @PostMapping("/{propertyId}/room-molds")
    @ResponseStatus(HttpStatus.CREATED)
    public RoomMoldResponse createRoomMold(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody SaveRoomMoldRequest request) {
        return roomMoldService.create(user.userId(), propertyId, request);
    }

    @PutMapping("/{propertyId}/room-molds/{moldId}")
    public RoomMoldResponse updateRoomMold(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID moldId,
            @Valid @RequestBody SaveRoomMoldRequest request) {
        return roomMoldService.update(user.userId(), propertyId, moldId, request);
    }

    /**
     * Retires a mold rather than deleting it.
     *
     * <p>DELETE because that is what it is from the owner's side — the type
     * stops being offered. The rooms already cut from it keep pointing at it,
     * because the mold is what says what they are.
     */
    @DeleteMapping("/{propertyId}/room-molds/{moldId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void retireRoomMold(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID moldId) {
        roomMoldService.retire(user.userId(), propertyId, moldId);
    }

    @PostMapping("/{propertyId}/room-molds/{moldId}/restore")
    public void restoreRoomMold(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID moldId) {
        roomMoldService.restore(user.userId(), propertyId, moldId);
    }

    /** One or many rooms from one mold. All or nothing on a number clash. */
    @PostMapping("/{propertyId}/rooms/from-mold")
    @ResponseStatus(HttpStatus.CREATED)
    public List<RoomResponse> createRoomsFromMold(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody CreateRoomsFromMoldRequest request) {
        return roomService.createRoomsFromMold(user.userId(), propertyId, request);
    }

    /** Moves an existing room onto a different mold — the upgrade path. */
    @PostMapping("/{propertyId}/rooms/{roomId}/recut")
    public RoomResponse recutRoom(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID roomId,
            @Valid @RequestBody RecutRoomRequest request) {
        return roomService.recutRoom(user.userId(), propertyId, roomId, request);
    }

    @PutMapping("/{propertyId}/rooms/{roomId}/amenities")
    public RoomResponse updateRoomAmenities(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID roomId,
            @Valid @RequestBody UpdateRoomAmenitiesRequest request) {
        return roomService.updateRoomAmenities(user.userId(), propertyId, roomId, request);
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
            @RequestParam(required = false) RoomStatus status,
            @RequestParam(required = false, defaultValue = "false") boolean includeInactive) {
        if (status != null) {
            return roomService.listRoomsByStatus(user.userId(), propertyId, status);
        }

        if (includeInactive) {
            return roomService.listAllRooms(user.userId(), propertyId);
        }

        return roomService.listRooms(user.userId(), propertyId);
    }

    @PatchMapping("/{propertyId}/rooms/{roomId}/status")
    public RoomResponse markRoomStatus(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID roomId,
            @Valid @RequestBody MarkRoomStatusRequest request) {
        return roomService.markRoomStatus(
                user.userId(), propertyId, roomId, request.status(), request.reason(), request.until());
    }

    @PatchMapping("/{propertyId}/rooms/{roomId}/maintenance")
    public RoomResponse updateRoomMaintenance(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID roomId,
            @Valid @RequestBody UpdateRoomMaintenanceRequest request) {
        return roomService.updateMaintenanceDetails(
                user.userId(), propertyId, roomId, request.reason(), request.until());
    }

    @PostMapping("/{propertyId}/rooms/{roomId}/reactivate")
    public RoomResponse reactivateRoom(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID roomId) {
        return roomService.reactivateRoom(user.userId(), propertyId, roomId);
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
