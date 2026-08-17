package com.khatiyan.d_modules.tenancy.api.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Owner/manager decision on a pending exit withdrawal.
 *
 * <p>Notes are optional either way. Unlike rejecting the exit itself, refusing
 * a withdrawal genuinely means only "no" — the owner may already have promised
 * the bed and is not obliged to justify holding the tenant to a departure the
 * tenant asked for.
 */
public record DecideTenancyExitWithdrawalRequest(
    @NotNull Boolean approved,
    @Size(max = 500) String adminNotes
) {
}
