package com.khatiyan.d_modules.property.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.data.domain.PageRequest;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.money.Money;
import com.khatiyan.d_modules.property.event.RoomLifecycleEvent;
import com.khatiyan.d_modules.property.api.dto.CreateRoomBulkRequest;
import com.khatiyan.d_modules.property.api.dto.CreateRoomRangeRequest;
import com.khatiyan.d_modules.property.api.dto.CreateRoomRequest;
import com.khatiyan.d_modules.property.api.dto.RoomActivityResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.api.dto.UpdateRoomRequest;
import com.khatiyan.d_modules.property.model.Property;
import com.khatiyan.d_modules.property.model.Room;
import com.khatiyan.d_modules.property.model.RoomActivity;
import com.khatiyan.d_modules.property.model.RoomActivityType;
import com.khatiyan.d_modules.property.model.RoomStatus;
import com.khatiyan.d_modules.property.repository.PropertyRepository;
import com.khatiyan.d_modules.property.repository.RoomActivityRepository;
import com.khatiyan.d_modules.property.repository.RoomRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Application service for rooms inside owner-managed properties.
 *
 * <p>This service owns room setup, room status changes, idempotent bulk room
 * creation, and tenancy-driven occupancy updates. Property ownership is
 * verified here before owner-facing room operations are allowed.
 */
@Slf4j
@Service
public class RoomService {

    private static final int MAX_ROOMS_PER_BULK_REQUEST = 200;

    private final PropertyRepository propertyRepository;
    private final RoomRepository roomRepository;
    private final RoomActivityRepository roomActivityRepository;
    private final PropertyManagerService propertyManagerService;
    private final PropertyAccessPolicy propertyAccessPolicy;
    private final AuthModule authModule;
    private final ApplicationEventPublisher eventPublisher;

    public RoomService(
            PropertyRepository propertyRepository,
            RoomRepository roomRepository,
            RoomActivityRepository roomActivityRepository,
            PropertyManagerService propertyManagerService,
            PropertyAccessPolicy propertyAccessPolicy,
            AuthModule authModule,
            ApplicationEventPublisher eventPublisher) {
        this.propertyRepository = propertyRepository;
        this.roomRepository = roomRepository;
        this.roomActivityRepository = roomActivityRepository;
        this.propertyManagerService = propertyManagerService;
        this.propertyAccessPolicy = propertyAccessPolicy;
        this.authModule = authModule;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Loads an active property the actor may READ rooms on.
     *
     * <p>
     * Split from {@link #getManageableActiveProperty} when ROOMS became a
     * graded permission: routing the room LISTS through the manage helper would
     * make view-only worthless, since a manager who cannot see the rooms has no
     * reason to open the module.
     */
    private Property getViewableActiveProperty(UUID actorUserId, UUID propertyId) {
        Property property = propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property", propertyId));

        propertyAccessPolicy.ensureCanViewRooms(actorUserId, propertyId);

        return property;
    }

    /**
     * Loads an active property and verifies the actor may CHANGE its rooms.
     */
    private Property getManageableActiveProperty(UUID actorUserId, UUID propertyId) {
        Property property = propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property", propertyId));

        propertyAccessPolicy.ensureCanManageRooms(actorUserId, propertyId);

        return property;
    }

    /**
     * Ensures a single-room create request does not reuse an active room number.
     */
    private void ensureRoomNumberIsAvailable(UUID propertyId, String roomNumber) {
        if (roomRepository.existsByPropertyIdAndRoomNumberAndActiveTrue(propertyId, roomNumber)) {
            throw new ValidationException("Room number is already active for this property");
        }
    }

    /**
     * Ensures a room update does not reuse another active room's number.
     */
    private void ensureRoomNumberIsAvailableForUpdate(UUID propertyId, UUID roomId, String roomNumber) {
        if (roomRepository.existsByPropertyIdAndRoomNumberAndActiveTrueAndIdNot(
                propertyId,
                roomNumber,
                roomId)) {
            throw new ValidationException("Room number is already active for this property");
        }
    }

    /**
     * Converts one generated range into individual room create requests.
     */
    private List<CreateRoomRequest> expandRoomRange(CreateRoomRangeRequest range) {
        if (range.startNumber() > range.endNumber()) {
            throw new ValidationException("Room range start number cannot be greater than end number");
        }

        List<CreateRoomRequest> rooms = new ArrayList<>();
        String prefix = "";

        if (range.prefix() != null) {
            prefix = range.prefix();
        }

        for (int number = range.startNumber(); number <= range.endNumber(); number++) {
            rooms.add(new CreateRoomRequest(
                    prefix + number,
                    range.floor(),
                    range.capacity(),
                    range.roomType(),
                    range.conditioning(),
                    range.baseRentPaise()));
        }

        return rooms;
    }

    /**
     * Combines explicit rooms and generated ranges into one room request list.
     */
    private List<CreateRoomRequest> expandBulkRoomRequest(CreateRoomBulkRequest request) {
        List<CreateRoomRequest> expandedRequests = new ArrayList<>();

        if (request.rooms() != null) {
            expandedRequests.addAll(request.rooms());
        }

        if (request.ranges() != null) {
            for (CreateRoomRangeRequest range : request.ranges()) {
                expandedRequests.addAll(expandRoomRange(range));
            }
        }

        if (expandedRequests.isEmpty()) {
            throw new ValidationException("At least one room or room range is required");
        }

        if (expandedRequests.size() > MAX_ROOMS_PER_BULK_REQUEST) {
            throw new ValidationException("Cannot create more than 200 rooms in one request");
        }

        return expandedRequests;
    }

    /**
     * Removes rooms that already exist as active rooms while rejecting duplicates in the request.
     */
    private List<CreateRoomRequest> filterOutAlreadyActiveRooms(UUID propertyId, List<CreateRoomRequest> requests) {
        Set<String> uniqueRoomNumbersInRequest = new HashSet<>();

        for (CreateRoomRequest request : requests) {
            if (!uniqueRoomNumbersInRequest.add(request.roomNumber())) {
                throw new ValidationException("Duplicate room number in request: " + request.roomNumber());
            }
        }

        List<String> existingRoomNumbers = roomRepository.findActiveRoomNumbers(
                propertyId,
                uniqueRoomNumbersInRequest);

        Set<String> activeRoomNumberSet = new HashSet<>(existingRoomNumbers);

        return requests.stream()
                .filter(request -> !activeRoomNumberSet.contains(request.roomNumber()))
                .toList();
    }

    /**
     * Loads an active room in a property for normal reads or owner-driven changes.
     */
    private Room getActiveRoomInProperty(UUID propertyId, UUID roomId) {
        return roomRepository.findByIdAndPropertyIdAndActiveTrue(roomId, propertyId)
                .orElseThrow(() -> new NotFoundException("Room", roomId));
    }

    /**
     * Loads and locks an active room for tenancy-driven occupancy updates.
     */
    private Room getActiveRoomInPropertyForUpdate(UUID propertyId, UUID roomId) {
        return roomRepository.findActiveRoomForUpdate(propertyId, roomId)
                .orElseThrow(() -> new NotFoundException("Room", roomId));
    }

    /**
     * Creates one room under a manageable property with strict duplicate checking.
     */
    @Transactional
    public RoomResponse createRoom(UUID actorUserId, UUID propertyId, CreateRoomRequest request) {
        Property property = getManageableActiveProperty(actorUserId, propertyId);
        ensureRoomNumberIsAvailable(property.getId(), request.roomNumber());

        Room room = Room.create(
                property.getId(),
                request.roomNumber(),
                request.floor(),
                request.capacity(),
                request.roomType(),
                request.conditioning(),
                Money.ofPaise(request.baseRentPaise()));

        Room saved = roomRepository.save(room);
        log.info(
                "Room created roomId={} propertyId={} ownerId={} roomNumber={}",
                saved.getId(),
                propertyId,
                actorUserId,
                saved.getRoomNumber());

        return RoomResponse.from(saved);
    }

    /**
     * Creates many rooms under a manageable property, skipping already-active rooms.
     */
    @Transactional
    public List<RoomResponse> createRoomsBulk(UUID actorUserId, UUID propertyId, CreateRoomBulkRequest request) {
        Property property = getManageableActiveProperty(actorUserId, propertyId);
        List<CreateRoomRequest> expandedRequests = expandBulkRoomRequest(request);
        List<CreateRoomRequest> requestsToCreate = filterOutAlreadyActiveRooms(
                property.getId(),
                expandedRequests);

        if (requestsToCreate.isEmpty()) {
            log.info(
                    "Rooms bulk-create skipped propertyId={} ownerId={} requestedCount={} reason=all_rooms_already_exist",
                    propertyId,
                    actorUserId,
                    expandedRequests.size());

            return List.of();
        }

        List<Room> rooms = requestsToCreate.stream()
                .map(roomRequest -> Room.create(
                        property.getId(),
                        roomRequest.roomNumber(),
                        roomRequest.floor(),
                        roomRequest.capacity(),
                        roomRequest.roomType(),
                        roomRequest.conditioning(),
                        Money.ofPaise(roomRequest.baseRentPaise())))
                .toList();

        List<Room> savedRooms = roomRepository.saveAll(rooms);
        log.info(
                "Rooms bulk-created propertyId={} ownerId={} requestedCount={} createdCount={} skippedCount={}",
                propertyId,
                actorUserId,
                expandedRequests.size(),
                savedRooms.size(),
                expandedRequests.size() - savedRooms.size());

        return savedRooms.stream()
                .map(room -> RoomResponse.from(room))
                .toList();
    }

    /**
     * Allows a property manager to mark an empty room available or under maintenance.
     */
    @Transactional
    public RoomResponse markRoomStatus(
            UUID actorUserId,
            UUID propertyId,
            UUID roomId,
            RoomStatus status,
            String maintenanceReason,
            Instant maintenanceUntil) {

        getManageableActiveProperty(actorUserId, propertyId);
        Room room = getActiveRoomInProperty(propertyId, roomId);

        if (status == RoomStatus.OCCUPIED) {
            throw new ValidationException("Room cannot be manually marked as occupied");
        }

        boolean wasUnderMaintenance = room.isUnderMaintenance();

        if (null == status) {
            throw new ValidationException("Unsupported room status");
        } else
            switch (status) {
                case VACANT -> room.markVacant();
                case MAINTENANCE -> room.markMaintenance(maintenanceReason, maintenanceUntil, actorUserId, Instant.now());
                default -> throw new ValidationException("Unsupported room status");
            }

        log.info(
                "Room status updated roomId={} propertyId={} ownerId={} status={}",
                roomId,
                propertyId,
                actorUserId,
                status);

        if (status == RoomStatus.MAINTENANCE) {
            recordRoomActivity(room, RoomActivityType.MAINTENANCE_STARTED, room.getMaintenanceReason(), actorUserId);
            publishRoomLifecycle(room, RoomLifecycleEvent.Kind.MAINTENANCE_STARTED, actorUserId, room.getMaintenanceReason());
        } else if (status == RoomStatus.VACANT && wasUnderMaintenance) {
            recordRoomActivity(room, RoomActivityType.MAINTENANCE_ENDED, null, actorUserId);
            publishRoomLifecycle(room, RoomLifecycleEvent.Kind.MAINTENANCE_ENDED, actorUserId, null);
        }

        return RoomResponse.from(room, resolveUserName(room.getMaintenanceMarkedBy()));
    }

    /**
     * Edits a room's maintenance reason / until-date. Only the person who marked
     * the room (or the property owner) may edit — managers cannot edit another
     * manager's maintenance note.
     */
    @Transactional
    public RoomResponse updateMaintenanceDetails(
            UUID actorUserId,
            UUID propertyId,
            UUID roomId,
            String maintenanceReason,
            Instant maintenanceUntil) {

        Property property = getManageableActiveProperty(actorUserId, propertyId);
        Room room = getActiveRoomInProperty(propertyId, roomId);

        boolean isOwner = actorUserId.equals(property.getOwnerId());
        boolean isMarker = actorUserId.equals(room.getMaintenanceMarkedBy());
        if (!isOwner && !isMarker) {
            throw new ForbiddenException("Only the person who marked this room or the owner can edit it");
        }

        room.updateMaintenanceDetails(maintenanceReason, maintenanceUntil);

        log.info(
                "Room maintenance details edited roomId={} propertyId={} actorId={}",
                roomId,
                propertyId,
                actorUserId);

        return RoomResponse.from(room, resolveUserName(room.getMaintenanceMarkedBy()));
    }

    /**
     * Updates editable details on an active room after verifying property ownership.
     */
    @Transactional
    public RoomResponse updateRoom(UUID actorUserId, UUID propertyId, UUID roomId, UpdateRoomRequest request) {
        getManageableActiveProperty(actorUserId, propertyId);
        Room room = getActiveRoomInProperty(propertyId, roomId);
        ensureRoomNumberIsAvailableForUpdate(propertyId, roomId, request.roomNumber());

        room.updateDetails(
                request.roomNumber(),
                request.floor(),
                request.capacity(),
                request.roomType(),
                request.conditioning(),
                Money.ofPaise(request.baseRentPaise()));

        log.info(
                "Room updated roomId={} propertyId={} ownerId={} roomNumber={}",
                roomId,
                propertyId,
                actorUserId,
                room.getRoomNumber());

        return RoomResponse.from(room);
    }

    /**
     * Soft-deactivates an empty room after verifying property ownership.
     */
    @Transactional
    public void deactivateRoom(UUID actorUserId, UUID propertyId, UUID roomId) {
        getManageableActiveProperty(actorUserId, propertyId);
        Room room = getActiveRoomInProperty(propertyId, roomId);

        room.deactivate();

        log.info(
                "Room deactivated roomId={} propertyId={} ownerId={}",
                roomId,
                propertyId,
                actorUserId);

        recordRoomActivity(room, RoomActivityType.DEACTIVATED, null, actorUserId);
        publishRoomLifecycle(room, RoomLifecycleEvent.Kind.DEACTIVATED, actorUserId, null);
    }

    /**
     * Reactivates a previously deactivated room, bringing it back as vacant.
     */
    @Transactional
    public RoomResponse reactivateRoom(UUID actorUserId, UUID propertyId, UUID roomId) {
        getManageableActiveProperty(actorUserId, propertyId);
        Room room = roomRepository.findByIdAndPropertyId(roomId, propertyId)
                .orElseThrow(() -> new NotFoundException("Room", roomId));

        ensureRoomNumberIsAvailable(propertyId, room.getRoomNumber());
        room.reactivate();

        log.info(
                "Room reactivated roomId={} propertyId={} ownerId={}",
                roomId,
                propertyId,
                actorUserId);

        recordRoomActivity(room, RoomActivityType.REACTIVATED, null, actorUserId);
        publishRoomLifecycle(room, RoomLifecycleEvent.Kind.REACTIVATED, actorUserId, null);

        return RoomResponse.from(room);
    }

    private void publishRoomLifecycle(Room room, RoomLifecycleEvent.Kind kind, UUID actorUserId, String reason) {
        eventPublisher.publishEvent(new RoomLifecycleEvent(
                room.getPropertyId(),
                room.getId(),
                room.getRoomNumber(),
                kind,
                actorUserId,
                reason));
    }

    /**
     * Appends one row to the room activity feed. Each lifecycle action becomes
     * its own independent entry so the recent-activity feed keeps a history
     * rather than reflecting only the room's current state.
     */
    private void recordRoomActivity(Room room, RoomActivityType type, String reason, UUID actorUserId) {
        roomActivityRepository.save(RoomActivity.record(
                room.getPropertyId(),
                room.getId(),
                room.getRoomNumber(),
                type,
                reason,
                actorUserId,
                Instant.now()));
    }

    /**
     * Returns the most recent room lifecycle actions for a manageable property,
     * with each actor's display name resolved. Powers the dashboard feed.
     */
    @Transactional(readOnly = true)
    public List<RoomActivityResponse> listRecentRoomActivities(UUID actorUserId, UUID propertyId, int limit) {
        Property property = getViewableActiveProperty(actorUserId, propertyId);
        List<RoomActivity> activities = roomActivityRepository.findByPropertyIdOrderByOccurredAtDesc(
                property.getId(),
                PageRequest.of(0, Math.max(1, limit)));

        Set<UUID> actorIds = activities.stream()
                .map(RoomActivity::getActorUserId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());

        Map<UUID, UserSummaryResponse> actors = actorIds.isEmpty()
                ? Map.of()
                : authModule.findByIds(actorIds);

        return activities.stream()
                .map(activity -> {
                    UserSummaryResponse actor = activity.getActorUserId() == null
                            ? null
                            : actors.get(activity.getActorUserId());
                    return RoomActivityResponse.from(activity, actor == null ? null : actor.fullName());
                })
                .toList();
    }

    /**
     * Lists all active rooms under a manageable property.
     */
    @Transactional(readOnly = true)
    public List<RoomResponse> listRooms(UUID actorUserId, UUID propertyId) {
        Property property = getViewableActiveProperty(actorUserId, propertyId);

        return roomRepository.findByPropertyIdAndActiveTrue(property.getId())
                .stream()
                .map(room -> RoomResponse.from(room))
                .toList();
    }

    /**
     * Lists every room under a manageable property — active, under maintenance,
     * and deactivated — with the maintenance marker's display name resolved.
     * Used by the owner rooms screen so it can show active / maintenance /
     * deactivated filters and the "who marked it" detail.
     */
    @Transactional(readOnly = true)
    public List<RoomResponse> listAllRooms(UUID actorUserId, UUID propertyId) {
        Property property = getViewableActiveProperty(actorUserId, propertyId);
        List<Room> rooms = roomRepository.findByPropertyId(property.getId());

        Set<UUID> markerIds = rooms.stream()
                .map(Room::getMaintenanceMarkedBy)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());

        Map<UUID, UserSummaryResponse> markers = markerIds.isEmpty()
                ? Map.of()
                : authModule.findByIds(markerIds);

        return rooms.stream()
                .map(room -> {
                    UserSummaryResponse marker = room.getMaintenanceMarkedBy() == null
                            ? null
                            : markers.get(room.getMaintenanceMarkedBy());
                    return RoomResponse.from(room, marker == null ? null : marker.fullName());
                })
                .toList();
    }

    /**
     * Resolves a single user's display name through the auth module, tolerating
     * missing users (returns null) so room reads never fail on a stale marker.
     */
    private String resolveUserName(UUID userId) {
        if (userId == null) {
            return null;
        }
        return authModule.findById(userId).map(UserSummaryResponse::fullName).orElse(null);
    }

    /**
     * Lists active rooms for tenant-side read models already scoped by tenancy.
     */
    @Transactional(readOnly = true)
    public List<RoomResponse> listActiveRoomsForProperty(UUID propertyId) {
        Property property = propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property", propertyId));

        return roomRepository.findByPropertyIdAndActiveTrue(property.getId())
                .stream()
                .map(room -> RoomResponse.from(room))
                .toList();
    }

    /**
     * Lists active rooms by occupancy or maintenance status for a manageable property.
     */
    @Transactional(readOnly = true)
    public List<RoomResponse> listRoomsByStatus(UUID actorUserId, UUID propertyId, RoomStatus status) {
        Property property = getViewableActiveProperty(actorUserId, propertyId);

        return roomRepository.findByPropertyIdAndStatusAndActiveTrue(property.getId(), status)
                .stream()
                .map(room -> RoomResponse.from(room))
                .toList();
    }

    /**
     * Returns an active room summary for internal module read models.
     */
    @Transactional(readOnly = true)
    public RoomResponse getActiveRoom(UUID propertyId, UUID roomId) {
        Room room = getActiveRoomInProperty(propertyId, roomId);
        return RoomResponse.from(room);
    }

    /**
     * Returns a room summary for historical display without requiring the room
     * to still be active. Used by concern/history read models.
     */
    @Transactional(readOnly = true)
    public Optional<RoomResponse> findRoomForDisplay(UUID propertyId, UUID roomId) {
        return roomRepository.findByIdAndPropertyId(roomId, propertyId)
                .map(room -> RoomResponse.from(room));
    }

    /**
     * Returns room summaries for historical display without requiring rooms to still be active.
     */
    @Transactional(readOnly = true)
    public Map<UUID, RoomResponse> findRoomsForDisplay(UUID propertyId, Collection<UUID> roomIds) {
        if (roomIds == null || roomIds.isEmpty()) {
            return Collections.emptyMap();
        }

        return roomRepository.findByPropertyIdAndIdIn(propertyId, roomIds)
                .stream()
                .map(room -> RoomResponse.from(room))
                .collect(Collectors.toMap(RoomResponse::id, Function.identity(), (left, right) -> left));
    }

    /**
     * Returns the lowest active room rent for discovery price summaries.
     */
    @Transactional(readOnly = true)
    public Long findLowestActiveRoomRentPaise(UUID propertyId) {
        return roomRepository.findLowestActiveRoomRentPaise(propertyId).orElse(null);
    }

    /**
     * Answers whether a room can accept another active tenancy.
     */
    @Transactional(readOnly = true)
    public boolean hasAvailableVacancy(UUID propertyId, UUID roomId) {
        Room room = getActiveRoomInProperty(propertyId, roomId);
        return room.hasVacancy();
    }

    /**
     * Returns the current number of available tenancy slots for a room.
     */
    @Transactional(readOnly = true)
    public int getAvailableVacancies(UUID propertyId, UUID roomId) {
        Room room = getActiveRoomInProperty(propertyId, roomId);
        return room.getAvailableVacancies();
    }

    /**
     * Handles a tenancy-start event by locking the room and occupying one slot.
     */
    @Transactional
    public void handleTenancyStarted(UUID propertyId, UUID roomId) {
        Room room = getActiveRoomInPropertyForUpdate(propertyId, roomId);
        room.occupyOneSlot();

        log.info(
                "Room occupancy increased from tenancy propertyId={} roomId={} occupiedCount={} availableVacancies={} status={}",
                propertyId,
                roomId,
                room.getOccupiedCount(),
                room.getAvailableVacancies(),
                room.getStatus());
    }

    /**
     * Holds a bed for an approved room change. Row-locked like the occupancy
     * handlers so two approvals cannot both claim the last bed.
     */
    @Transactional
    public void reserveSlot(UUID propertyId, UUID roomId) {
        Room room = getActiveRoomInPropertyForUpdate(propertyId, roomId);
        room.reserveOneSlot();

        log.info(
                "Room bed reserved propertyId={} roomId={} reservedCount={} availableVacancies={}",
                propertyId,
                roomId,
                room.getReservedCount(),
                room.getAvailableVacancies());
    }

    /**
     * Releases a held bed. Called when the move executes — the bed is then taken
     * through the normal tenancy-transfer path — or when it can no longer run.
     */
    @Transactional
    public void releaseReservedSlot(UUID propertyId, UUID roomId) {
        Room room = getActiveRoomInPropertyForUpdate(propertyId, roomId);
        room.releaseReservedSlot();

        log.info(
                "Room bed reservation released propertyId={} roomId={} reservedCount={} availableVacancies={}",
                propertyId,
                roomId,
                room.getReservedCount(),
                room.getAvailableVacancies());
    }

    /**
     * Handles a tenancy-end event by locking the room and releasing one slot.
     */
    @Transactional
    public void handleTenancyEnded(UUID propertyId, UUID roomId) {
        Room room = getActiveRoomInPropertyForUpdate(propertyId, roomId);
        room.vacateOneSlot();

        log.info(
                "Room occupancy decreased from tenancy propertyId={} roomId={} occupiedCount={} availableVacancies={} status={}",
                propertyId,
                roomId,
                room.getOccupiedCount(),
                room.getAvailableVacancies(),
                room.getStatus());
    }
}
