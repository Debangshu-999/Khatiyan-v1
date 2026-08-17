package com.khatiyan.d_modules.discovery.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.discovery.model.PropertyImage;

public record PropertyImageResponse(
        UUID id,
        String url,
        String publicId,
        int sortOrder,
        /** The listing thumbnail. Derived, so the client never computes it. */
        boolean cover
) {

    public static PropertyImageResponse from(PropertyImage image) {
        return new PropertyImageResponse(
                image.getId(),
                image.getUrl(),
                image.getPublicId(),
                image.getSortOrder(),
                image.getSortOrder() == 0);
    }
}
