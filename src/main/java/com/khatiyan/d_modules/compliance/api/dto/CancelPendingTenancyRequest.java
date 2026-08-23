package com.khatiyan.d_modules.compliance.api.dto;

import jakarta.validation.constraints.Size;

/**
 * Why an unaccepted tenancy is being withdrawn.
 *
 * <p>Optional, and the whole body may be omitted. The reason is a note on a
 * record nobody will read again — the tenancy is cancelled and the bed freed
 * either way — so demanding one would only teach owners to type a full stop.
 */
public record CancelPendingTenancyRequest(

    @Size(max = 300)
    String reason
) {
}
