package com.khatiyan.d_modules.property.api.dto;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.RoomAmenity;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Cutting rooms from molds — one room or sixty, in a single transaction.
 *
 * <p>A list of specs rather than one mold and a list of numbers. "Create a room"
 * and "create ten rooms" were always the same act with a different length of
 * list; this takes the idea one step further, because the ten need not be the
 * same KIND of room. A floor is rarely uniform — two singles, a double and a
 * dormitory is an ordinary landing — and expressing that as four requests would
 * give up the one guarantee this endpoint makes.
 *
 * <p><b>All or nothing.</b> Whatever the mix, the whole list is checked for
 * repeats and clashes before anything is written, so a batch never lands
 * half-created.
 */
public record CreateRoomsFromMoldRequest(
        @NotEmpty
        @Size(max = 60, message = "Create at most 60 rooms at a time")
        List<@NotNull @Valid RoomSpec> rooms) {

    /**
     * One room to create.
     *
     * @param baseRentPaise   null takes the mold's. Rent is explicitly a
     *                        DEFAULT on a mold — rooms are expected to diverge,
     *                        which is why anything reporting what a double costs
     *                        here has to read the rooms — so setting it at the
     *                        moment of cutting is no different from setting it a
     *                        minute later
     * @param amenities       null takes the mold's, which is the ordinary case;
     *                        a set — empty included — is this room differing
     * @param customAmenities as above, for the owner's own additions
     */
    public record RoomSpec(
            @NotNull UUID moldId,
            @NotBlank @Size(max = 40) String roomNumber,
            @Size(max = 40) String floor,
            @PositiveOrZero Long baseRentPaise,
            Set<RoomAmenity> amenities,
            Set<String> customAmenities) {
    }
}
