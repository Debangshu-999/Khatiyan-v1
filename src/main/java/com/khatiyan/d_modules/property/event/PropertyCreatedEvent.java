package com.khatiyan.d_modules.property.event;

import java.util.UUID;

public record PropertyCreatedEvent(
        UUID propertyId,
        UUID ownerId,
        String discoveryHeadline,
        String discoveryDescription,
        String discoveryProfileImageUrl
) {
}
