package com.khatiyan.d_modules.property.model;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A PG, hostel, or similar rental property managed by an owner.
 *
 * <p>The property module owns property identity, address details, and
 * owner relationship. Other modules should refer to properties by id
 * and use {@code PropertyModule} instead of importing this entity.
 */
@Entity
@Table(name = "properties", schema = "property")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Property extends BaseEntity {

    private static final int MAX_CUSTOM_FACILITIES = 30;
    private static final int MAX_CUSTOM_FACILITY_LENGTH = 80;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, length = 300)
    private String address;

    @Column(nullable = false, length = 80)
    private String city;

    @Column(nullable = false, length = 10)
    private String pincode;

    @Column(precision = 10, scale = 7)
    private BigDecimal latitude;

    @Column(precision = 10, scale = 7)
    private BigDecimal longitude;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PropertyType type;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    @Column(name = "daily_guest_ac_rate_paise")
    private Long dailyGuestAcRatePaise;

    @Column(name = "daily_guest_non_ac_rate_paise")
    private Long dailyGuestNonAcRatePaise;

    @Column(name = "rent_late_fee_per_day_paise")
    private Long rentLateFeePerDayPaise;

    @Column(name = "standard_deposit_paise", nullable = false)
    private long standardDepositPaise;

    @Column(name = "notice_period_days", nullable = false)
    private int noticePeriodDays;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_collection_timing", nullable = false, length = 20)
    private BillingCollectionTiming billingCollectionTiming;

    @Column(name = "rent_grace_days", nullable = false)
    private int rentGraceDays;

    @ElementCollection
    @CollectionTable(
            name = "property_facilities",
            schema = "property",
            joinColumns = @JoinColumn(name = "property_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "facility", nullable = false, length = 40)
    private Set<PropertyFacility> facilities = new HashSet<>();

    @ElementCollection
    @CollectionTable(
            name = "property_custom_facilities",
            schema = "property",
            joinColumns = @JoinColumn(name = "property_id"))
    @Column(name = "name", nullable = false, length = 80)
    private Set<String> customFacilities = new HashSet<>();

    private Property(UUID ownerId, String name, String address, String city,
                     String pincode, BigDecimal latitude, BigDecimal longitude,
                     PropertyType type, Set<PropertyFacility> facilities,
                     Set<String> customFacilities, Long dailyGuestAcRatePaise,
                     Long dailyGuestNonAcRatePaise, Long rentLateFeePerDayPaise,
                     Integer rentGraceDays,
                     Long standardDepositPaise, Integer noticePeriodDays) {
        this.id = UUID.randomUUID();
        this.ownerId = ownerId;
        this.name = name;
        this.address = address;
        this.city = city;
        this.pincode = pincode;
        this.latitude = latitude;
        this.longitude = longitude;
        this.type = type;
        this.active = true;
        updateDailyGuestRates(dailyGuestAcRatePaise, dailyGuestNonAcRatePaise);
        updateRentLateFee(rentLateFeePerDayPaise);
        updateBillingPolicy(rentGraceDays);
        updateDepositPolicy(standardDepositPaise);
        updateExitPolicy(noticePeriodDays);
        replaceFacilities(facilities, customFacilities);
    }

    public static Property create(UUID ownerId, String name, String address, String city,
                                  String pincode, BigDecimal latitude, BigDecimal longitude,
                                  PropertyType type, Set<PropertyFacility> facilities,
                                  Set<String> customFacilities, Long dailyGuestAcRatePaise,
                                  Long dailyGuestNonAcRatePaise, Long rentLateFeePerDayPaise,
                                  Integer rentGraceDays, Long standardDepositPaise,
                                  Integer noticePeriodDays) {
        return new Property(
                ownerId,
                name,
                address,
                city,
                pincode,
                latitude,
                longitude,
                type,
                facilities,
                customFacilities,
                dailyGuestAcRatePaise,
                dailyGuestNonAcRatePaise,
                rentLateFeePerDayPaise,
                rentGraceDays,
                standardDepositPaise,
                noticePeriodDays);
    }

    public void updateDetails(String name, String address, String city, String pincode,
                              BigDecimal latitude, BigDecimal longitude, PropertyType type,
                              Set<PropertyFacility> facilities, Set<String> customFacilities,
                              Long dailyGuestAcRatePaise, Long dailyGuestNonAcRatePaise,
                              Long rentLateFeePerDayPaise,
                              Integer rentGraceDays, Long standardDepositPaise,
                              Integer noticePeriodDays) {
        this.name = name;
        this.address = address;
        this.city = city;
        this.pincode = pincode;
        this.latitude = latitude;
        this.longitude = longitude;
        this.type = type;
        updateDailyGuestRates(dailyGuestAcRatePaise, dailyGuestNonAcRatePaise);
        updateRentLateFee(rentLateFeePerDayPaise);
        updateBillingPolicy(rentGraceDays);
        updateDepositPolicy(standardDepositPaise);
        updateExitPolicy(noticePeriodDays);
        replaceFacilities(facilities, customFacilities);
    }

    public Long dailyGuestRateFor(RoomConditioning conditioning) {
        if (conditioning == RoomConditioning.AC) {
            return dailyGuestAcRatePaise;
        }

        return dailyGuestNonAcRatePaise;
    }

    public void deactivate() {
        this.active = false;
    }

    public boolean isCurrentlyActive() {
        return active;
    }

    private void replaceFacilities(Set<PropertyFacility> facilities, Set<String> customFacilities) {
        this.facilities.clear();
        if (facilities != null) {
            this.facilities.addAll(facilities);
        }

        this.customFacilities.clear();
        if (customFacilities == null) {
            return;
        }

        if (customFacilities.size() > MAX_CUSTOM_FACILITIES) {
            throw new ValidationException("A property can have at most 30 custom facilities");
        }

        for (String customFacility : customFacilities) {
            String normalized = normalizeCustomFacility(customFacility);
            if (!normalized.isBlank()) {
                this.customFacilities.add(normalized);
            }
        }
    }

    private void updateDailyGuestRates(Long dailyGuestAcRatePaise, Long dailyGuestNonAcRatePaise) {
        validateDailyGuestRate(dailyGuestAcRatePaise, "Daily guest AC rate must be positive");
        validateDailyGuestRate(dailyGuestNonAcRatePaise, "Daily guest non-AC rate must be positive");

        this.dailyGuestAcRatePaise = dailyGuestAcRatePaise;
        this.dailyGuestNonAcRatePaise = dailyGuestNonAcRatePaise;
    }

    private void validateDailyGuestRate(Long ratePaise, String message) {
        if (ratePaise != null && ratePaise <= 0) {
            throw new ValidationException(message);
        }
    }

    private void updateRentLateFee(Long rentLateFeePerDayPaise) {
        if (rentLateFeePerDayPaise != null && rentLateFeePerDayPaise < 0) {
            throw new ValidationException("Rent late fee per day cannot be negative");
        }

        this.rentLateFeePerDayPaise = rentLateFeePerDayPaise;
    }

    private void updateBillingPolicy(Integer rentGraceDays) {
        this.billingCollectionTiming = BillingCollectionTiming.CYCLE_START;

        if (rentGraceDays == null) {
            this.rentGraceDays = 3;
            return;
        }

        if (rentGraceDays < 0 || rentGraceDays > 30) {
            throw new ValidationException("Rent grace days must be between 0 and 30");
        }

        this.rentGraceDays = rentGraceDays;
    }

    private void updateDepositPolicy(Long standardDepositPaise) {
        if (standardDepositPaise == null) {
            this.standardDepositPaise = 0;
            return;
        }

        if (standardDepositPaise < 0) {
            throw new ValidationException("Standard deposit cannot be negative");
        }

        this.standardDepositPaise = standardDepositPaise;
    }

    private void updateExitPolicy(Integer noticePeriodDays) {
        if (noticePeriodDays == null) {
            this.noticePeriodDays = 30;
            return;
        }

        if (noticePeriodDays < 0 || noticePeriodDays > 365) {
            throw new ValidationException("Notice period days must be between 0 and 365");
        }

        this.noticePeriodDays = noticePeriodDays;
    }

    private String normalizeCustomFacility(String customFacility) {
        if (customFacility == null) {
            return "";
        }

        String normalized = customFacility.trim();
        if (normalized.length() > MAX_CUSTOM_FACILITY_LENGTH) {
            throw new ValidationException("Custom facility must be at most 80 characters");
        }

        return normalized;
    }
}
