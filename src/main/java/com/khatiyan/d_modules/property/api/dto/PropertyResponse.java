package com.khatiyan.d_modules.property.api.dto;

import com.khatiyan.d_modules.property.model.Property;
import com.khatiyan.d_modules.property.model.PropertyFacility;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.c_shared.billing.BillingCollectionTiming;

import java.math.BigDecimal;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

/**
 * API representation of an owner-managed property.
 */
public record PropertyResponse(
    UUID id,
    String referenceCode,
    UUID ownerId,
    String name,
    String address,
    String city,
    String pincode,
    BigDecimal latitude,
    BigDecimal longitude,
    PropertyType type,
    Set<PropertyFacility> facilities,
    Set<String> customFacilities,
    Long dailyGuestAcRatePaise,
    Long dailyGuestNonAcRatePaise,
    Long rentLateFeePerDayPaise,
    BillingCollectionTiming billingCollectionTiming,
    int rentGraceDays,
    long standardDepositPaise,
    int noticePeriodDays,
    boolean discoveryProfileCreated,
    boolean active
) {

    public static PropertyResponse from(Property property) {
        return new PropertyResponse(
            property.getId(),
            property.getReferenceCode(),
            property.getOwnerId(),
            property.getName(),
            property.getAddress(),
            property.getCity(),
            property.getPincode(),
            property.getLatitude(),
            property.getLongitude(),
            property.getType(),
            Set.copyOf(property.getFacilities()),
            new TreeSet<>(property.getCustomFacilities()),
            property.getDailyGuestAcRatePaise(),
            property.getDailyGuestNonAcRatePaise(),
            property.getRentLateFeePerDayPaise(),
            property.getBillingCollectionTiming(),
            property.getRentGraceDays(),
            property.getStandardDepositPaise(),
            property.getNoticePeriodDays(),
            property.isDiscoveryProfileCreated(),
            property.isCurrentlyActive()
        );
    }
}
