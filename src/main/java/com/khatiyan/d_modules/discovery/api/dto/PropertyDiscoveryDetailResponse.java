package com.khatiyan.d_modules.discovery.api.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.d_modules.discovery.model.PropertyDiscoveryProfile;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.NoticePeriod;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyFacility;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.property.model.SharingType;

public record PropertyDiscoveryDetailResponse(
        UUID propertyId,
        UUID ownerId,
        String name,
        String headline,
        String description,
        String address,
        String area,
        String city,
        String state,
        String pincode,
        BigDecimal latitude,
        BigDecimal longitude,
        Double distanceKm,
        String directionsUrl,
        PropertyType type,
        PgFor pgFor,
        PreferredTenantType preferredFor,
        boolean foodIncluded,
        Set<MealType> includedMeals,
        boolean electricityIncluded,
        BathroomType bathroomType,
        Set<SharingType> availableSharingTypes,
        Set<PropertyFacility> facilities,
        Set<String> customFacilities,
        long standardDepositPaise,
        Long startingRoomRentPaise,
        /**
         * Exit and payment terms, shown before anyone commits.
         *
         * <p>A prospective tenant is choosing between properties partly on how
         * hard they are to leave. Hiding the notice period until after move-in
         * makes that unknowable at the only moment it could change their mind.
         */
        NoticePeriod noticePeriod,
        int rentGraceDays,
        boolean dailyRentingAvailable,
        Long dailyGuestAcRatePaise,
        Long dailyGuestNonAcRatePaise,
        String profileImageUrl,
        String ownerName,
        String ownerPhone,
        /**
         * The owner's email, and only when they have VERIFIED it.
         *
         * <p>Null otherwise, which the reader is shown as an unavailable way to
         * reach them. An unverified address is one nobody has proved they can
         * read, so offering it invites a message into a void.
         */
        String ownerEmail,
        boolean showOwnerContact,
        boolean showManagerContact,
        /**
         * Everyone this listing says to call, owner first.
         *
         * <p>Supersedes the three owner fields above, which stay for callers not
         * yet moved across. The owner appears here only when
         * {@code showOwnerContact} allows it; a manager appears because somebody
         * chose to list them, which IS the opt-in.
         */
        List<PropertyContactResponse> contacts,
        /** The full gallery, cover first. {@code profileImageUrl} is the cover. */
        List<String> imageUrls,
        /**
         * The same gallery with each photo's caption, in the same order.
         *
         * <p>Separate from {@code imageUrls} rather than replacing it: the
         * search cards read that flat list and have nowhere to show a caption.
         */
        List<PropertyImageResponse> images
) {

    public static PropertyDiscoveryDetailResponse from(
            PropertyResponse property,
            PropertyDiscoveryProfile profile,
            Double distanceKm,
            String directionsUrl,
            Long startingRoomRentPaise,
            String ownerName,
            String ownerPhone,
            String ownerEmail,
            List<PropertyContactResponse> contacts,
            List<String> imageUrls,
            List<PropertyImageResponse> images) {
        return new PropertyDiscoveryDetailResponse(
                property.id(),
                property.ownerId(),
                property.name(),
                profile.getHeadline(),
                profile.getDescription(),
                property.address(),
                property.area(),
                property.city(),
                property.state(),
                property.pincode(),
                property.latitude(),
                property.longitude(),
                distanceKm,
                directionsUrl,
                property.type(),
                property.pgFor(),
                property.preferredFor(),
                property.foodIncluded(),
                property.includedMeals(),
                property.electricityIncluded(),
                property.bathroomType(),
                property.availableSharingTypes(),
                property.facilities(),
                property.customFacilities(),
                property.standardDepositPaise(),
                startingRoomRentPaise,
                property.noticePeriod(),
                property.rentGraceDays(),
                hasPositiveDailyRate(property.dailyGuestAcRatePaise())
                        || hasPositiveDailyRate(property.dailyGuestNonAcRatePaise()),
                property.dailyGuestAcRatePaise(),
                property.dailyGuestNonAcRatePaise(),
                profile.getProfileImageUrl(),
                ownerName,
                ownerPhone,
                ownerEmail,
                profile.isShowOwnerContact(),
                profile.isShowManagerContact(),
                contacts == null ? List.of() : contacts,
                imageUrls == null ? List.of() : imageUrls,
                images == null ? List.of() : images);
    }

    private static boolean hasPositiveDailyRate(Long value) {
        return value != null && value > 0;
    }
}
