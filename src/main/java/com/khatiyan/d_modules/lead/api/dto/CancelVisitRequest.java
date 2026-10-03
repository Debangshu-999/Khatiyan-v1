package com.khatiyan.d_modules.lead.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Cancelling a visit (owner's design, 2026-10-03): whether the person is still
 * interested, and why, both required. Not interested marks the enquiry so, and
 * its 7 days to close begin. Still interested keeps it Interested.
 *
 * @param stillInterested boxed, so a body without it is refused by name rather
 *                        than failing whole under Jackson 3
 */
public record CancelVisitRequest(
        @NotNull(message = "Say whether they are still interested.")
        Boolean stillInterested,
        @NotBlank(message = "Give a reason for cancelling.")
        @Size(max = 500, message = "The reason can be at most 500 characters.")
        String reason) {
}
