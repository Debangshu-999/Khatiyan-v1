package com.khatiyan.d_modules.property.api.dto;

import java.util.Map;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.ManagerAccessLevel;
import com.khatiyan.d_modules.property.model.ManagerResource;

/**
 * What a user may see and do on a property, resource by resource.
 *
 * <p>
 * {@code levels} is always complete — every {@link ManagerResource} appears,
 * NONE included — so the client never has to decide what a missing key means.
 */
public record ManagerPermissionsResponse(
    UUID propertyId,
    UUID managerUserId,
    // True for the property owner, whose access is total and not grantable.
    boolean owner,
    Map<ManagerResource, ManagerAccessLevel> levels
) {
}
