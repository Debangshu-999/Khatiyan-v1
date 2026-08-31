package com.khatiyan.d_modules.property.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

class RoomMoldTest {

    private static final UUID PROPERTY = UUID.randomUUID();

    @Test
    void aNamedSharingTypeTakesItsOwnBedCount() {
        RoomMold mold = mold(RoomType.TRIPLE, RoomConditioning.AC, null);

        assertThat(mold.getBedCount()).isEqualTo(3);
    }

    @Test
    void aBedCountThatContradictsTheSharingTypeIsRefused() {
        // "Double sharing with three beds" is not a stricter double; it is a
        // triple wearing the wrong label, and every listing downstream would
        // repeat it.
        assertThatThrownBy(() -> mold(RoomType.DOUBLE, RoomConditioning.AC, 3))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("2 beds");
    }

    @Test
    void aDormitoryMustSayHowManyBeds() {
        assertThatThrownBy(() -> mold(RoomType.DORMITORY, RoomConditioning.NON_AC, null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("bed count");
    }

    @Test
    void twoDormitorySizesAreTwoDifferentMolds() {
        // The reason bed count lives on the mold rather than on the sharing
        // type: these do not rent for the same money.
        assertThat(mold(RoomType.DORMITORY, RoomConditioning.NON_AC, 6).getBedCount()).isEqualTo(6);
        assertThat(mold(RoomType.DORMITORY, RoomConditioning.NON_AC, 10).getBedCount()).isEqualTo(10);
    }

    @Test
    void aDormitorySmallerThanFiveIsRefused() {
        // Four-sharing is its own occupancy, so anything at or below it is that
        // occupancy — a "3-bed dormitory" would sort and filter as a dormitory
        // while being a triple.
        assertThatThrownBy(() -> mold(RoomType.DORMITORY, RoomConditioning.NON_AC, 3))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("at least 5");
    }

    @Test
    void aRoomCutFromAMoldCopiesItsShapeAndDefaults() {
        RoomMold mold = mold(RoomType.DOUBLE, RoomConditioning.AC, null);

        Room room = Room.fromMold(mold, "203", "Second floor");

        assertThat(room.getCapacity()).isEqualTo(2);
        assertThat(room.getRoomType()).isEqualTo(RoomType.DOUBLE);
        assertThat(room.getConditioning()).isEqualTo(RoomConditioning.AC);
        assertThat(room.getBaseRentPaise()).isEqualTo(900_000L);
        assertThat(room.getMoldId()).isEqualTo(mold.getId());
        assertThat(room.getAmenities()).containsExactly(RoomAmenity.CUPBOARD);
    }

    @Test
    void editingARoomsAmenitiesDoesNotReachBackIntoTheMold() {
        // The whole template-not-parent decision, in one assertion.
        RoomMold mold = mold(RoomType.DOUBLE, RoomConditioning.AC, null);
        Room room = Room.fromMold(mold, "203", null);

        room.updateAmenities(Set.of(RoomAmenity.TV), Set.of("Balcony"));

        assertThat(mold.getAmenities()).containsExactly(RoomAmenity.CUPBOARD);
        assertThat(mold.getCustomAmenities()).isEmpty();
    }

    @Test
    void recuttingARoomMovesItOntoTheNewShape() {
        Room room = Room.fromMold(mold(RoomType.DOUBLE, RoomConditioning.NON_AC, null), "203", null);
        RoomMold upgrade = mold(RoomType.TRIPLE, RoomConditioning.AC, null);

        room.recut(upgrade);

        assertThat(room.getCapacity()).isEqualTo(3);
        assertThat(room.getConditioning()).isEqualTo(RoomConditioning.AC);
        assertThat(room.getMoldId()).isEqualTo(upgrade.getId());
    }

    @Test
    void aRoomCannotShrinkBelowThePeopleAlreadyInIt() {
        // The guard that makes recut safe to offer at all. Without it an owner
        // "upgrading" a full four-bed room to a double would leave two tenants
        // in beds the room no longer has.
        Room room = Room.fromMold(mold(RoomType.FOUR_SHARING, RoomConditioning.AC, null), "301", null);
        room.occupyOneSlot();
        room.occupyOneSlot();
        room.occupyOneSlot();

        assertThatThrownBy(() -> room.recut(mold(RoomType.DOUBLE, RoomConditioning.AC, null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Move them");
    }

    @Test
    void aMoldFromAnotherPropertyIsRefused() {
        Room room = Room.fromMold(mold(RoomType.DOUBLE, RoomConditioning.AC, null), "203", null);

        RoomMold elsewhere = RoomMold.create(
                UUID.randomUUID(), RoomType.TRIPLE, RoomConditioning.AC, null, 900_000L, Set.of(), Set.of(),
                List.of());

        assertThatThrownBy(() -> room.recut(elsewhere))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("different property");
    }

    @Test
    void customAmenitiesAreDeduplicatedCaseInsensitively() {
        // "Balcony" and "balcony" are one amenity to a reader and two rows to a
        // primary key.
        RoomMold mold = RoomMold.create(
                PROPERTY, RoomType.SINGLE, RoomConditioning.AC, null, 900_000L,
                Set.of(), Set.of("Balcony", "balcony", "  Study table  "), List.of());

        // Which SPELLING survives is not asserted, because it cannot be: the
        // input is a Set and has no order for "first" to mean anything against.
        // What is guaranteed is that the pair collapses to one and the padding
        // is gone.
        assertThat(mold.getCustomAmenities()).hasSize(2);
        assertThat(mold.getCustomAmenities()).contains("Study table");
        assertThat(mold.getCustomAmenities().stream().map(String::toLowerCase))
                .containsExactlyInAnyOrder("balcony", "study table");
    }

    private static RoomMold mold(RoomType sharingType, RoomConditioning conditioning, Integer bedCount) {
        return RoomMold.create(
                PROPERTY,
                sharingType,
                conditioning,
                bedCount,
                900_000L,
                Set.of(RoomAmenity.CUPBOARD),
                Set.of(),
                List.of());
    }
}
