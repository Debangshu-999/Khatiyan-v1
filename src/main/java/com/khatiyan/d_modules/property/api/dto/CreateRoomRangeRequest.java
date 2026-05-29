package com.khatiyan.d_modules.property.api.dto;

import com.khatiyan.d_modules.property.model.RoomConditioning;
import com.khatiyan.d_modules.property.model.RoomType;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request body section used to generate many rooms from a number range.
 *
 * <p>For example, prefix "A-" with start 101 and end 103 creates
 * A-101, A-102, and A-103.
 */
public record CreateRoomRangeRequest(

    @Size(max = 20)
    String prefix,

    @Min(1)
    int startNumber,

    @Min(1)
    int endNumber,

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
