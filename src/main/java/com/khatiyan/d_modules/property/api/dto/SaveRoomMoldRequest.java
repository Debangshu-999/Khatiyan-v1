package com.khatiyan.d_modules.property.api.dto;

import java.util.List;
import java.util.Set;

import com.khatiyan.d_modules.property.model.RoomAmenity;
import com.khatiyan.d_modules.property.model.RoomConditioning;
import com.khatiyan.d_modules.property.model.RoomType;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * Creating or editing a mold.
 *
 * @param bedCount null for the fixed sharing types, which take their own count;
 *                 required for a dormitory, where only the owner knows it
 */
public record SaveRoomMoldRequest(
        @NotNull RoomType sharingType,
        @NotNull RoomConditioning conditioning,
        Integer bedCount,
        @NotNull @PositiveOrZero Long baseRentPaise,
        Set<RoomAmenity> amenities,
        Set<String> customAmenities,
        @Size(max = 10, message = "A room type can have at most 10 images")
        List<@Valid ImageInput> images) {

    /**
     * A photo already uploaded to Cloudinary.
     *
     * <p>The bytes never come through this API — the client uploads directly
     * against a signature and sends back what it got. `publicId` is optional
     * because an older URL may not have one; without it the asset simply cannot
     * be cleaned up later.
     */
    public record ImageInput(
            @NotBlank @Size(max = 600) String url,
            @Size(max = 255) String publicId) {
    }
}
