package com.khatiyan.d_modules.property.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.money.Money;

/**
 * Beds held for an approved room change.
 *
 * <p>
 * The bug these cover: approving a room change used to reserve nothing, so the
 * target bed stayed available until the transfer date. Anything could take it,
 * and the executor's re-check then failed the approved move from a scheduler.
 */
class RoomReservationTest {

    private static Room room(int capacity) {
        return Room.create(
                UUID.randomUUID(),
                "101",
                "1",
                capacity,
                RoomType.DOUBLE,
                RoomConditioning.NON_AC,
                Money.ofPaise(10_000_00L));
    }

    @Test
    void reservedBedIsNotAvailableToAnyoneElse() {
        Room room = room(1);

        room.reserveOneSlot();

        assertThat(room.getAvailableVacancies()).isZero();
        assertThat(room.hasVacancy()).isFalse();
        assertThatThrownBy(room::occupyOneSlot)
                .as("a new tenancy must not be able to take the bed held for an approved move")
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void releasingTheHoldLetsTheApprovedMoveTakeTheBed() {
        Room room = room(1);
        room.reserveOneSlot();

        // What execution does: give back our own hold, then the transfer event
        // occupies the bed through the normal tenancy path.
        room.releaseReservedSlot();
        room.occupyOneSlot();

        assertThat(room.getOccupiedCount()).isEqualTo(1);
        assertThat(room.getAvailableVacancies()).isZero();
        assertThat(room.getStatus()).isEqualTo(RoomStatus.OCCUPIED);
    }

    @Test
    void reservationCannotExceedRemainingCapacity() {
        Room room = room(2);
        room.occupyOneSlot();
        room.reserveOneSlot();

        assertThatThrownBy(room::reserveOneSlot)
                .as("one occupied + one held fills a two-bed room")
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void heldBedBlocksMaintenanceEvenThoughNobodyLivesThere() {
        Room room = room(1);
        room.reserveOneSlot();

        assertThatThrownBy(() -> room.markMaintenance("Repaint", null, UUID.randomUUID(), null))
                .as("the room is empty, but a tenant is due to move in")
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void capacityCannotBeCutBelowOccupiedPlusHeld() {
        Room room = room(3);
        room.occupyOneSlot();
        room.reserveOneSlot();

        assertThatThrownBy(() -> room.updateDetails("101", "1", 1, RoomType.DOUBLE, RoomConditioning.NON_AC, Money.ofPaise(10_000_00L)))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void releasingWithoutAHoldIsRejected() {
        assertThatThrownBy(() -> room(1).releaseReservedSlot())
                .isInstanceOf(ValidationException.class);
    }
}
