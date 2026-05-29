package com.khatiyan.d_modules.property.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body used by an owner to assign a manager to a property.
 *
 * <p>If the manager user does not exist yet, auth provisioning creates a normal
 * user account. Management rights come from the property manager assignment row.
 */
public record AddPropertyManagerRequest(
    @NotBlank @Size(max = 15) String phone,
    @NotBlank @Size(max = 120) String fullName
) {
}
