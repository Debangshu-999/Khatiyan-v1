package com.khatiyan.d_modules.tenancy.api.dto;

import jakarta.validation.constraints.Size;

/**
 * Tenant payload for asking to undo an already-approved exit.
 *
 * <p>The reason is optional. The tenant is asking a favour here, not asserting
 * a right, and the owner is free to refuse for any reason or none — so a
 * mandatory field would be theatre.
 */
public record WithdrawTenancyExitRequest(
    @Size(max = 500) String reason
) {
}
