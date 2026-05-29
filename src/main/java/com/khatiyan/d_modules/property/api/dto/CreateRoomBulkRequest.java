package com.khatiyan.d_modules.property.api.dto;

import java.util.List;

import jakarta.validation.Valid;

/**
 * Request body used for bulk room setup.
 *
 * <p>Owners can provide explicit rooms, generated room ranges, or both.
 * Service validation ensures at least one room is produced.
 */
public record CreateRoomBulkRequest(

    @Valid
    List<CreateRoomRequest> rooms,

    @Valid
    List<CreateRoomRangeRequest> ranges
) {
}
