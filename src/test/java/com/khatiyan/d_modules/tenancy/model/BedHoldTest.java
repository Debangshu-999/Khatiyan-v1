package com.khatiyan.d_modules.tenancy.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

class BedHoldTest {
    private final UUID booking = UUID.randomUUID();
    private final UUID property = UUID.randomUUID();
    private final UUID room = UUID.randomUUID();
    private final LocalDate date = LocalDate.of(2026, 10, 17);

    @Test
    void liveHoldIsImmediatelyHeldAndCanBeReleasedOnlyOnce() {
        BedHold hold = BedHold.booking(booking, property, room, date, null, null);
        assertThat(hold.getState()).isEqualTo(BedHold.State.HELD);
        assertThat(hold.materialize()).isFalse();
        assertThat(hold.release()).isTrue();
        assertThat(hold.release()).isFalse();
        assertThat(hold.materialize()).isFalse();
    }

    @Test
    void futureHoldWaitsForActualDepartureThenMaterializesOnlyOnce() {
        BedHold hold = BedHold.booking(booking, property, room, date, UUID.randomUUID(), UUID.randomUUID());
        assertThat(hold.getState()).isEqualTo(BedHold.State.WAITING);
        assertThat(hold.materialize()).isTrue();
        assertThat(hold.materialize()).isFalse();
        assertThat(hold.release()).isTrue();
    }

    @Test
    void releaseBeforeDepartureDoesNotResurrectAtMaterialization() {
        BedHold hold = BedHold.booking(booking, property, room, date, UUID.randomUUID(), UUID.randomUUID());
        assertThat(hold.release()).isTrue();
        assertThat(hold.materialize()).isFalse();
        assertThat(hold.active()).isFalse();
    }

    @Test
    void aFutureHoldRequiresBothItsDepartureAndConfirmedExit() {
        assertThatThrownBy(() -> BedHold.booking(booking, property, room, date, UUID.randomUUID(), null))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> BedHold.booking(booking, property, room, date, null, UUID.randomUUID()))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void replayCannotChangeFrozenReservationIdentityOrDate() {
        BedHold hold = BedHold.booking(booking, property, room, date, null, null);
        hold.requireSameBooking(property, room, date, null);
        assertThatThrownBy(() -> hold.requireSameBooking(UUID.randomUUID(), room, date, null)).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> hold.requireSameBooking(property, UUID.randomUUID(), date, null)).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> hold.requireSameBooking(property, room, date.plusDays(1), null)).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> hold.requireSameBooking(property, room, date, UUID.randomUUID())).isInstanceOf(ValidationException.class);
    }

    @Test
    void aReleasedHoldCannotBeReplayedAsANewAllocation() {
        BedHold hold = BedHold.booking(booking, property, room, date, null, null);
        hold.release();
        assertThatThrownBy(() -> hold.requireSameBooking(property, room, date, null)).isInstanceOf(ValidationException.class);
    }
}
