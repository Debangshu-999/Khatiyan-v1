package com.khatiyan.d_modules.property.service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.money.Money;
import com.khatiyan.d_modules.property.api.dto.CreateRoomBulkRequest;
import com.khatiyan.d_modules.property.api.dto.CreateRoomRangeRequest;
import com.khatiyan.d_modules.property.api.dto.CreateRoomRequest;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.api.dto.UpdateRoomRequest;
import com.khatiyan.d_modules.property.model.Property;
import com.khatiyan.d_modules.property.model.Room;
import com.khatiyan.d_modules.property.model.RoomStatus;
import com.khatiyan.d_modules.property.repository.PropertyRepository;
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
    private final PropertyManagerService propertyManagerService;

    public RoomService(
            PropertyRepository propertyRepository,
            RoomRepository roomRepository,
            PropertyManagerService propertyManagerService) {
        this.propertyRepository = propertyRepository;
        this.roomRepository = roomRepository;
        this.propertyManagerService = propertyManagerService;
    }

    /**
     * Loads an active property and verifies that the actor owns or manages it.
     */
    private Property getManageableActiveProperty(UUID actorUserId, UUID propertyId) {
        Property property = propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property_", propertyId));

        propertyManagerService.ensureCanManageProperty(actorUserId, propertyId);

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
                .orElseThrow(() -> new NotFoundException("Room_", roomId));
    }

    /**
     * Loads and locks an active room for tenancy-driven occupancy updates.
     */
    private Room getActiveRoomInPropertyForUpdate(UUID propertyId, UUID roomId) {
        return roomRepository.findActiveRoomForUpdate(propertyId, roomId)
                .orElseThrow(() -> new NotFoundException("Room_", roomId));
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
            RoomStatus status) {

        getManageableActiveProperty(actorUserId, propertyId);
        Room room = getActiveRoomInProperty(propertyId, roomId);

        if (status == RoomStatus.OCCUPIED) {
            throw new ValidationException("Room cannot be manually marked as occupied");
        }

        if (null == status) {
            throw new ValidationException("Unsupported room status");
        } else
            switch (status) {
                case VACANT -> room.markVacant();
                case MAINTENANCE -> room.markMaintenance();
                default -> throw new ValidationException("Unsupported room status");
            }

        log.info(
                "Room status updated roomId={} propertyId={} ownerId={} status={}",
                roomId,
                propertyId,
                actorUserId,
                status);

        return RoomResponse.from(room);
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
    }

    /**
     * Lists all active rooms under a manageable property.
     */
    @Transactional(readOnly = true)
    public List<RoomResponse> listRooms(UUID actorUserId, UUID propertyId) {
        Property property = getManageableActiveProperty(actorUserId, propertyId);

        return roomRepository.findByPropertyIdAndActiveTrue(property.getId())
                .stream()
                .map(room -> RoomResponse.from(room))
                .toList();
    }

    /**
     * Lists active rooms for tenant-side read models already scoped by tenancy.
     */
    @Transactional(readOnly = true)
    public List<RoomResponse> listActiveRoomsForProperty(UUID propertyId) {
        Property property = propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property_", propertyId));

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
        Property property = getManageableActiveProperty(actorUserId, propertyId);

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
