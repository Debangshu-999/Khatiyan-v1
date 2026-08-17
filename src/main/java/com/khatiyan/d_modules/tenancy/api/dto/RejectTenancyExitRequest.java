package com.khatiyan.d_modules.tenancy.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Owner/manager rejection payload for an exit request.
 *
 * <p>The reason is required. Rejection cannot mean "you may not leave" — a
 * tenant serving notice is exercising a right, not asking permission — so what
 * it has to mean is "this request is not right": wrong date, duplicate, raised
 * in error. Requiring the reason is what keeps those apart, and the tenant needs
 * it to re-raise with the correction. Approval carries no such requirement.
 */
public record RejectTenancyExitRequest(
    @NotBlank(message = "A reason is required when rejecting an exit request")
    @Size(max = 500) String adminNotes
) {
}
