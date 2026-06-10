package com.khatiyan.d_modules.property.api.dto;

/**
 * Result of looking up a phone number before assigning a property manager.
 * Mirrors the tenant-lookup flow so the owner sees who they are about to add.
 */
public record ManagerLookupResponse(
    boolean exists,
    String fullName,
    boolean alreadyAssigned,
    boolean eligible,
    String message
) {
}
