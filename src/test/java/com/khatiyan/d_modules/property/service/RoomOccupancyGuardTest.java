package com.khatiyan.d_modules.property.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.money.Money;
import com.khatiyan.d_modules.property.api.dto.RecutRoomRequest;
import com.khatiyan.d_modules.property.api.dto.UpdateRoomRequest;
import com.khatiyan.d_modules.property.model.Property;
import com.khatiyan.d_modules.property.model.Room;
import com.khatiyan.d_modules.property.model.RoomConditioning;
import com.khatiyan.d_modules.property.model.RoomStatus;
import com.khatiyan.d_modules.property.model.RoomType;
import com.khatiyan.d_modules.property.repository.PropertyRepository;
import com.khatiyan.d_modules.property.repository.RoomActivityRepository;
import com.khatiyan.d_modules.property.repository.RoomRepository;

/**
 * A room somebody is living in cannot be edited, restatused or deactivated.
 *
 * <p>The room number is on a signed agreement, the type is what the tenant
 * agreed to rent, and the rent is what they were quoted. The app hides those
 * three controls while a room is occupied, but the endpoint is what has to be
 * true — the screen is the courtesy.
 */
@ExtendWith(MockitoExtension.class)
class RoomOccupancyGuardTest {

    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID PROPERTY = UUID.randomUUID();

    @Mock
    private PropertyRepository propertyRepository;

    @Mock
    private RoomRepository roomRepository;

    @Mock
    private RoomMoldService roomMoldService;

    @Mock
    private RoomActivityRepository roomActivityRepository;

    @Mock
    private PropertyManagerService propertyManagerService;

    @Mock
    private PropertyAccessPolicy propertyAccessPolicy;

    @Mock
    private AuthModule authModule;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Mock
    private Property property;

    private RoomService roomService;

    @BeforeEach
    void setUp() {
        roomService = new RoomService(
                propertyRepository,
                roomRepository,
                roomMoldService,
                roomActivityRepository,
                propertyManagerService,
                propertyAccessPolicy,
                authModule,
                eventPublisher);
    }

    @Test
    void anOccupiedRoomCannotBeEdited() {
        Room room = occupied(1);

        assertThatThrownBy(() -> roomService.updateRoom(OWNER, PROPERTY, room.getId(), editTo("102")))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("occupied or reserved");

        // The number is not even checked for a clash: nothing about this room is
        // up for change, so it never gets that far.
        verify(roomRepository, never())
                .existsByPropertyIdAndRoomNumberAndActiveTrueAndIdNot(any(), any(), any());
    }

    @Test
    void anOccupiedRoomCannotBeRecutOntoAnotherType() {
        Room room = occupied(1);

        assertThatThrownBy(
                        () -> roomService.recutRoom(
                                OWNER, PROPERTY, room.getId(), new RecutRoomRequest(UUID.randomUUID())))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("another type");

        // Refused before the mold is even loaded.
        verify(roomMoldService, never()).requireActive(any(), any());
    }

    @Test
    void anOccupiedRoomCannotBeDeactivated() {
        Room room = occupied(1);

        assertThatThrownBy(() -> roomService.deactivateRoom(OWNER, PROPERTY, room.getId()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("deactivated");

        assertThat(room.isCurrentlyActive()).isTrue();
    }

    @Test
    void anOccupiedRoomCannotBeTakenOutOfService() {
        Room room = occupied(1);

        assertThatThrownBy(
                        () -> roomService.markRoomStatus(
                                OWNER, PROPERTY, room.getId(), RoomStatus.MAINTENANCE, "Repainting", null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("out of service");
    }

    /**
     * A bed HELD for an approved room change counts as occupied.
     *
     * <p>Somebody is moving into it who has already been told what they are
     * getting, so the terms are just as fixed as for a tenant already in place.
     */
    @Test
    void aReservedBedBlocksTheSameThings() {
        Room room = empty();
        room.reserveOneSlot();

        assertThatThrownBy(() -> roomService.updateRoom(OWNER, PROPERTY, room.getId(), editTo("102")))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("occupied or reserved");
    }

    @Test
    void anEmptyRoomIsStillEditable() {
        Room room = empty();
        when(roomRepository.existsByPropertyIdAndRoomNumberAndActiveTrueAndIdNot(PROPERTY, "102", room.getId()))
                .thenReturn(false);

        assertThatCode(() -> roomService.updateRoom(OWNER, PROPERTY, room.getId(), editTo("102")))
                .doesNotThrowAnyException();
        assertThat(room.getRoomNumber()).isEqualTo("102");
    }

    // ---------------------------------------------------------------- setup

    private static UpdateRoomRequest editTo(String roomNumber) {
        return new UpdateRoomRequest(roomNumber, "1", 2, RoomType.DOUBLE, RoomConditioning.NON_AC, 900_000L);
    }

    private Room empty() {
        Room room = Room.create(
                PROPERTY, "101", "1", 2, RoomType.DOUBLE, RoomConditioning.NON_AC, Money.ofPaise(900_000L));
        stub(room);
        return room;
    }

    private Room occupied(int beds) {
        Room room = empty();
        for (int at = 0; at < beds; at += 1) {
            room.occupyOneSlot();
        }
        return room;
    }

    /**
     * Enough of the world for the service to reach the guard.
     *
     * <p>The property is a mock rather than a real one: this test is about
     * occupancy, and building a Property through its factory would tie it to
     * two dozen unrelated arguments that have nothing to say about the rule.
     */
    private void stub(Room room) {
        lenient().when(propertyRepository.findByIdAndActiveTrue(PROPERTY)).thenReturn(Optional.of(property));
        lenient()
                .when(roomRepository.findByIdAndPropertyIdAndActiveTrue(room.getId(), PROPERTY))
                .thenReturn(Optional.of(room));
        // Recut reads the room under a row lock, so it goes through a different
        // finder than the other three.
        lenient()
                .when(roomRepository.findActiveRoomForUpdate(PROPERTY, room.getId()))
                .thenReturn(Optional.of(room));
    }
}
