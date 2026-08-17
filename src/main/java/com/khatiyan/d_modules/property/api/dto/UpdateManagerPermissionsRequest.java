package com.khatiyan.d_modules.property.api.dto;

import java.util.Map;

import com.khatiyan.d_modules.property.model.ManagerAccessLevel;
import com.khatiyan.d_modules.property.model.ManagerResource;

import jakarta.validation.constraints.NotNull;

/**
 * Replaces a manager's permissions wholesale.
 *
 * <p>
 * A full replacement rather than a patch: the owner's screen shows every
 * resource at once, so sending the whole picture avoids the ambiguity of a
 * missing key meaning either "leave it" or "revoke it". Anything omitted here is
 * revoked.
 */
public record UpdateManagerPermissionsRequest(
    @NotNull Map<ManagerResource, ManagerAccessLevel> levels
) {
}
