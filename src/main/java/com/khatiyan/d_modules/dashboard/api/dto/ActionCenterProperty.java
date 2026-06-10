package com.khatiyan.d_modules.dashboard.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.property.model.PropertyType;

/**
 * Property header for the owner action center.
 */
public record ActionCenterProperty(
    UUID propertyId,
    String name,
    String referenceCode,
    String city,
    PropertyType type
) {
}
