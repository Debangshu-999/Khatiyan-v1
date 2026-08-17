package com.khatiyan.d_modules.property.event;

import java.util.List;
import java.util.UUID;

public record PropertyCreatedEvent(
        UUID propertyId,
        UUID ownerId,
        String discoveryHeadline,
        String discoveryDescription,
        String discoveryProfileImageUrl,
        /**
         * The gallery chosen during registration, cover first. Already uploaded
         * to storage by the client — a failed upload never reaches this far.
         */
        List<ImageRef> discoveryImages
) {

    /**
     * A stored image, declared in this module rather than discovery's.
     *
     * <p>Discovery is allowed to depend on property; property is not allowed to
     * depend on discovery. An event carrying a discovery DTO would invert that
     * and fail the module structure test.
     */
    public record ImageRef(String url, String publicId) {
    }
}
