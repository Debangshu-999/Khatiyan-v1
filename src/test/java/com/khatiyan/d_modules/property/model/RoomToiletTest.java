package com.khatiyan.d_modules.property.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;

import org.junit.jupiter.api.Test;

/** A room's toilet follows the property's bathroom type, never a tick (user, 2026-10-29). */
class RoomToiletTest {

    @Test
    void commonBathroomsGiveACommonToiletWhateverWasTicked() {
        assertThat(RoomAmenities.withToilet(Set.of(RoomAmenity.ATTACHED_TOILET, RoomAmenity.TV), BathroomType.COMMON))
                .containsExactlyInAnyOrder(RoomAmenity.COMMON_TOILET, RoomAmenity.TV);
    }

    @Test
    void attachedBathroomsGiveAnAttachedToiletEvenUnticked() {
        assertThat(RoomAmenities.withToilet(Set.of(RoomAmenity.GEYSER), BathroomType.ATTACHED))
                .containsExactlyInAnyOrder(RoomAmenity.ATTACHED_TOILET, RoomAmenity.GEYSER);
        assertThat(RoomAmenities.withToilet(null, BathroomType.ATTACHED)).containsExactly(RoomAmenity.ATTACHED_TOILET);
    }
}
