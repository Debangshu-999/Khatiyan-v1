package com.khatiyan.d_modules.property.api.dto;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.RoomAmenity;
import com.khatiyan.d_modules.property.model.RoomConditioning;
import com.khatiyan.d_modules.property.model.RoomMold;
import com.khatiyan.d_modules.property.model.RoomType;

/**
 * A mold as the app shows it.
 *
 * @param roomCount how many rooms were cut from this mold — the number that
 *                  makes retiring one a decision rather than a guess
 */
public record RoomMoldResponse(
        UUID id,
        UUID propertyId,
        RoomType sharingType,
        RoomConditioning conditioning,
        int bedCount,
        long baseRentPaise,
        Set<RoomAmenity> amenities,
        Set<String> customAmenities,
        List<Image> images,
        boolean active,
        long roomCount) {

    public record Image(String url, String publicId) {
    }


    public static RoomMoldResponse from(RoomMold mold, long roomCount) {
        return new RoomMoldResponse(
                mold.getId(),
                mold.getPropertyId(),
                mold.getSharingType(),
                mold.getConditioning(),
                mold.getBedCount(),
                mold.getBaseRentPaise(),
                Set.copyOf(mold.getAmenities()),
                Set.copyOf(mold.getCustomAmenities()),
                mold.getImages().stream()
                        .map(image -> new Image(image.getUrl(), image.getPublicId()))
                        .toList(),
                mold.isActive(),
                roomCount);
    }
}
