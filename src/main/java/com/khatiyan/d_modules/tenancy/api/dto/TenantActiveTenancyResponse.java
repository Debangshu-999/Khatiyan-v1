package com.khatiyan.d_modules.tenancy.api.dto;

import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;

/**
 * Tenant-facing profile view for the currently active tenancy.
 *
 * <p>This response acts as the tenant's property profile: it combines the
 * authenticated user summary, active tenancy terms, property summary, and room
 * summary so the frontend does not need manager-only property APIs.
 */
public record TenantActiveTenancyResponse(
    UserSummaryResponse user,
    TenancyResponse tenancy,
    PropertyResponse property,
    RoomResponse room
) {
}
