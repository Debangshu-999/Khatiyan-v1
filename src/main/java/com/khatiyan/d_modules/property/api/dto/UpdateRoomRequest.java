package com.khatiyan.d_modules.property.api.dto;

import com.khatiyan.d_modules.property.model.RoomConditioning;
import com.khatiyan.d_modules.property.model.RoomType;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request body used by an owner to update editable room details.
 */
public record UpdateRoomRequest(

    @NotBlank
    @Size(max = 40)
    String roomNumber,

    @Size(max = 40)
    String floor,

    @Min(1)
    int capacity,

    @NotNull
    RoomType roomType,

    @NotNull
    RoomConditioning conditioning,

    @Min(0)
    long baseRentPaise
) {
}
