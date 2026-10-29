package com.khatiyan.d_modules.tenancy.api.dto;

import jakarta.validation.constraints.Size;

/** The tenant's answer: it looks right, or a note of what is different. */
public record RespondMoveInChecklistRequest(
        boolean looksRight,
        @Size(max = 500, message = "Keep your note under 500 characters") String note) {
}
