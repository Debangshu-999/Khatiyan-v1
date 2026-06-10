package com.khatiyan.d_modules.tenancy.api.dto;

import jakarta.validation.constraints.Size;

public record ReviewRoomChangeRequest(
    @Size(max = 500) String adminNotes
) {
}
