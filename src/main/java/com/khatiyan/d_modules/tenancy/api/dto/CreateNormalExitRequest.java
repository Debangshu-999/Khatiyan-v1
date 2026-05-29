package com.khatiyan.d_modules.tenancy.api.dto;

import jakarta.validation.constraints.Size;

/**
 * Tenant request for a normal notice-period exit.
 */
public record CreateNormalExitRequest(
    @Size(max = 500) String reason
) {
}
