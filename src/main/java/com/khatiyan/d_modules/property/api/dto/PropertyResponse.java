package com.khatiyan.d_modules.property.api.dto;

import com.khatiyan.d_modules.property.model.Property;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.NoticePeriod;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyFacility;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.property.model.SharingType;
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
    String area,
    String city,
    String state,
    String pincode,
    BigDecimal latitude,
    BigDecimal longitude,
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
    Long dailyGuestAcRatePaise,
    Long dailyGuestNonAcRatePaise,
    Long rentLateFeePerDayPaise,
    BillingCollectionTiming billingCollectionTiming,
    int rentGraceDays,
    long standardDepositPaise,
    NoticePeriod noticePeriod,
    // Derived for display only. Zero for the whole-month options, which are
    // counted in cycles rather than days -- clients should render `noticePeriod`.
    int noticePeriodDays,
    /**
     * What leaving before serving notice costs, in the owner's words. Null when
     * the property has not written one. Read into the agreement's
     * PREMATURE_EXIT clause for indefinite terms.
     */
    String prematureExitPolicy,
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
            property.getArea(),
            property.getCity(),
            property.getState(),
            property.getPincode(),
            property.getLatitude(),
            property.getLongitude(),
            property.getType(),
            property.getPgFor(),
            property.getPreferredFor(),
            property.isFoodIncluded(),
            Set.copyOf(property.getIncludedMeals()),
            property.isElectricityIncluded(),
            property.getBathroomType(),
            Set.copyOf(property.getAvailableSharingTypes()),
            Set.copyOf(property.getFacilities()),
            new TreeSet<>(property.getCustomFacilities()),
            property.getDailyGuestAcRatePaise(),
            property.getDailyGuestNonAcRatePaise(),
            property.getRentLateFeePerDayPaise(),
            property.getBillingCollectionTiming(),
            property.getRentGraceDays(),
            property.getStandardDepositPaise(),
            property.getNoticePeriod(),
            property.getNoticePeriod().days(),
            property.getPrematureExitPolicy(),
            property.isDiscoveryProfileCreated(),
            property.isCurrentlyActive()
        );
    }
}
