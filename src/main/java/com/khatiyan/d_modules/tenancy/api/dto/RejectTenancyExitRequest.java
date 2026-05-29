package com.khatiyan.d_modules.tenancy.api.dto;

import jakarta.validation.constraints.Size;

/**
 * Owner/manager rejection payload for an exit request.
 */
public record RejectTenancyExitRequest(
    @Size(max = 500) String adminNotes
) {
}
