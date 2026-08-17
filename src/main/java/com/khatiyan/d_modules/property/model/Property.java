package com.khatiyan.d_modules.property.model;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
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
import jakarta.persistence.OrderColumn;
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
    private static final int MAX_DAMAGE_CHARGES = 50;
    private static final int MAX_EXIT_CHECKLIST_ITEMS = 30;
    private static final int MAX_EXIT_CHECKLIST_ITEM_LENGTH = 120;

    // Seeded onto every new property and backfilled onto existing ones so the
    // move-out checklist is never empty. Owners can override it under exit policies.
    public static final List<String> DEFAULT_EXIT_CHECKLIST = List.of(
            "Keys returned",
            "Dues cleared",
            "Final inspection completed");

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "reference_code", nullable = false, length = 40, unique = true)
    private String referenceCode;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, length = 300)
    private String address;

    @Column(nullable = false, length = 120)
    private String area;

    @Column(nullable = false, length = 80)
    private String city;

    @Column(length = 80)
    private String state;

    @Column(nullable = false, length = 10)
    private String pincode;

    @Column(precision = 10, scale = 7)
    private BigDecimal latitude;

    @Column(precision = 10, scale = 7)
    private BigDecimal longitude;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PropertyType type;

    @Enumerated(EnumType.STRING)
    @Column(name = "pg_for", nullable = false, length = 20)
    private PgFor pgFor;

    @Enumerated(EnumType.STRING)
    @Column(name = "preferred_for", nullable = false, length = 20)
    private PreferredTenantType preferredFor;

    @Column(name = "food_included", nullable = false)
    private boolean foodIncluded;

    @Column(name = "electricity_included", nullable = false)
    private boolean electricityIncluded;

    @Enumerated(EnumType.STRING)
    @Column(name = "bathroom_type", nullable = false, length = 20)
    private BathroomType bathroomType;

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

    /**
     * Longest rent grace a property may set.
     *
     * <p>Was 30, which let the payment window span a whole cycle. That window is
     * also when an exit request may be raised, so a grace that wide breaks the
     * assumption that requests arrive near a cycle start.
     */
    public static final int MAX_RENT_GRACE_DAYS = 10;

    /**
     * How much notice a tenant must give. An enum rather than a day count —
     * see {@link NoticePeriod} for why the distinction matters.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "notice_period", nullable = false, length = 20)
    private NoticePeriod noticePeriod;

    @Column(name = "discovery_profile_created", nullable = false)
    private boolean discoveryProfileCreated;

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

    @ElementCollection
    @CollectionTable(
            name = "property_included_meals",
            schema = "property",
            joinColumns = @JoinColumn(name = "property_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "meal_type", nullable = false, length = 20)
    private Set<MealType> includedMeals = new HashSet<>();

    @ElementCollection
    @CollectionTable(
            name = "property_available_sharing_types",
            schema = "property",
            joinColumns = @JoinColumn(name = "property_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "sharing_type", nullable = false, length = 30)
    private Set<SharingType> availableSharingTypes = new HashSet<>();

    // Exit policies — the damage-charge schedule and the move-out checklist. Both
    // are property-owned (uniform across the property's tenancies) and read at
    // deposit settlement and by the compliance agreement assembler. Ordered lists.
    @ElementCollection
    @CollectionTable(
            name = "property_damage_charges",
            schema = "property",
            joinColumns = @JoinColumn(name = "property_id"))
    @OrderColumn(name = "display_order")
    private List<PropertyDamageCharge> damageCharges = new ArrayList<>();

    /**
     * What leaving early costs on an indefinite agreement, in the owner's own
     * words. Applied by a person at end-tenancy — deliberately not modelled, so
     * each property can price a departure the way it actually does.
     */
    @Column(name = "premature_exit_policy", length = 2000)
    private String prematureExitPolicy;

    @ElementCollection
    @CollectionTable(
            name = "property_exit_checklist_items",
            schema = "property",
            joinColumns = @JoinColumn(name = "property_id"))
    @OrderColumn(name = "display_order")
    @Column(name = "label", nullable = false, length = MAX_EXIT_CHECKLIST_ITEM_LENGTH)
    private List<String> exitChecklist = new ArrayList<>();

    private Property(String referenceCode, UUID ownerId, String name, String address, String area, String city,
                     String state,
                     String pincode, BigDecimal latitude, BigDecimal longitude,
                     PropertyType type, PgFor pgFor, PreferredTenantType preferredFor,
                     Boolean foodIncluded, Set<MealType> includedMeals,
                     Boolean electricityIncluded, BathroomType bathroomType,
                     Set<SharingType> availableSharingTypes, Set<PropertyFacility> facilities,
                     Set<String> customFacilities, Long dailyGuestAcRatePaise,
                     Long dailyGuestNonAcRatePaise, Long rentLateFeePerDayPaise,
                     Integer rentGraceDays,
                     Long standardDepositPaise, NoticePeriod noticePeriod) {
        this.id = UUID.randomUUID();
        this.referenceCode = referenceCode;
        this.ownerId = ownerId;
        this.name = name;
        this.address = address;
        this.area = normalizeArea(area);
        this.city = city;
        this.state = normalizeState(state);
        this.pincode = pincode;
        updateCoordinates(latitude, longitude, true);
        this.type = type;
        this.active = true;
        this.discoveryProfileCreated = false;
        updateDiscoveryFilters(
                pgFor,
                preferredFor,
                foodIncluded,
                includedMeals,
                electricityIncluded,
                bathroomType,
                availableSharingTypes);
        updateDailyGuestRates(dailyGuestAcRatePaise, dailyGuestNonAcRatePaise);
        updateRentLateFee(rentLateFeePerDayPaise);
        updateBillingPolicy(rentGraceDays);
        updateDepositPolicy(standardDepositPaise);
        updateExitPolicy(noticePeriod);
        replaceFacilities(facilities, customFacilities);
        this.exitChecklist.addAll(DEFAULT_EXIT_CHECKLIST);
    }

    public static Property create(UUID ownerId, String name, String address, String area, String city,
                                  String state,
                                  String pincode, BigDecimal latitude, BigDecimal longitude,
                                  PropertyType type, PgFor pgFor, PreferredTenantType preferredFor,
                                  Boolean foodIncluded, Set<MealType> includedMeals,
                                  Boolean electricityIncluded, BathroomType bathroomType,
                                  Set<SharingType> availableSharingTypes, Set<PropertyFacility> facilities,
                                  Set<String> customFacilities, Long dailyGuestAcRatePaise,
                                  Long dailyGuestNonAcRatePaise, Long rentLateFeePerDayPaise,
                                  Integer rentGraceDays, Long standardDepositPaise,
                                  NoticePeriod noticePeriod) {
        return create(
                "PROP-LOCAL-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                ownerId,
                name,
                address,
                area,
                city,
                state,
                pincode,
                latitude,
                longitude,
                type,
                pgFor,
                preferredFor,
                foodIncluded,
                includedMeals,
                electricityIncluded,
                bathroomType,
                availableSharingTypes,
                facilities,
                customFacilities,
                dailyGuestAcRatePaise,
                dailyGuestNonAcRatePaise,
                rentLateFeePerDayPaise,
                rentGraceDays,
                standardDepositPaise,
                noticePeriod);
    }

    public static Property create(String referenceCode, UUID ownerId, String name, String address, String area, String city,
                                  String state,
                                  String pincode, BigDecimal latitude, BigDecimal longitude,
                                  PropertyType type, PgFor pgFor, PreferredTenantType preferredFor,
                                  Boolean foodIncluded, Set<MealType> includedMeals,
                                  Boolean electricityIncluded, BathroomType bathroomType,
                                  Set<SharingType> availableSharingTypes, Set<PropertyFacility> facilities,
                                  Set<String> customFacilities, Long dailyGuestAcRatePaise,
                                  Long dailyGuestNonAcRatePaise, Long rentLateFeePerDayPaise,
                                  Integer rentGraceDays, Long standardDepositPaise,
                                  NoticePeriod noticePeriod) {
        return new Property(
                referenceCode,
                ownerId,
                name,
                address,
                area,
                city,
                state,
                pincode,
                latitude,
                longitude,
                type,
                pgFor,
                preferredFor,
                foodIncluded,
                includedMeals,
                electricityIncluded,
                bathroomType,
                availableSharingTypes,
                facilities,
                customFacilities,
                dailyGuestAcRatePaise,
                dailyGuestNonAcRatePaise,
                rentLateFeePerDayPaise,
                rentGraceDays,
                standardDepositPaise,
                noticePeriod);
    }

    public void updateDetails(String name, String address, String area, String city, String state, String pincode,
                              BigDecimal latitude, BigDecimal longitude, PropertyType type,
                              PgFor pgFor, PreferredTenantType preferredFor,
                              Boolean foodIncluded, Set<MealType> includedMeals,
                              Boolean electricityIncluded, BathroomType bathroomType,
                              Set<SharingType> availableSharingTypes,
                              Set<PropertyFacility> facilities, Set<String> customFacilities,
                              Long dailyGuestAcRatePaise, Long dailyGuestNonAcRatePaise,
                              Long rentLateFeePerDayPaise,
                              Integer rentGraceDays, Long standardDepositPaise,
                              NoticePeriod noticePeriod) {
        this.name = name;
        this.address = address;
        this.area = normalizeArea(area);
        this.city = city;
        this.state = normalizeState(state);
        this.pincode = pincode;
        updateCoordinates(latitude, longitude, false);
        this.type = type;
        updateDiscoveryFilters(
                pgFor,
                preferredFor,
                foodIncluded,
                includedMeals,
                electricityIncluded,
                bathroomType,
                availableSharingTypes);
        updateDailyGuestRates(dailyGuestAcRatePaise, dailyGuestNonAcRatePaise);
        updateRentLateFee(rentLateFeePerDayPaise);
        updateBillingPolicy(rentGraceDays);
        updateDepositPolicy(standardDepositPaise);
        updateExitPolicy(noticePeriod);
        replaceFacilities(facilities, customFacilities);
    }

    private void updateDiscoveryFilters(
            PgFor pgFor,
            PreferredTenantType preferredFor,
            Boolean foodIncluded,
            Set<MealType> includedMeals,
            Boolean electricityIncluded,
            BathroomType bathroomType,
            Set<SharingType> availableSharingTypes) {
        this.pgFor = pgFor == null ? PgFor.ANYONE : pgFor;
        this.preferredFor = preferredFor == null ? PreferredTenantType.ANYONE : preferredFor;
        this.foodIncluded = Boolean.TRUE.equals(foodIncluded);
        this.electricityIncluded = Boolean.TRUE.equals(electricityIncluded);
        this.bathroomType = bathroomType == null ? BathroomType.COMMON : bathroomType;

        this.includedMeals.clear();
        if (this.foodIncluded && includedMeals != null) {
            this.includedMeals.addAll(includedMeals);
        }

        this.availableSharingTypes.clear();
        if (availableSharingTypes != null) {
            this.availableSharingTypes.addAll(availableSharingTypes);
        }
    }

    /**
     * Backfill-only coordinate write: fills absent coordinates from a server-side
     * geocode and never overwrites a point the owner pinned on the map.
     */
    public void backfillCoordinates(BigDecimal latitude, BigDecimal longitude) {
        if (this.latitude != null || this.longitude != null) {
            return;
        }
        if (latitude == null || longitude == null) {
            return;
        }
        this.latitude = latitude;
        this.longitude = longitude;
    }

    private void updateCoordinates(BigDecimal latitude, BigDecimal longitude, boolean creating) {
        if (latitude == null && longitude == null) {
            if (creating) {
                this.latitude = null;
                this.longitude = null;
            }
            return;
        }

        if (latitude == null || longitude == null) {
            throw new ValidationException("Latitude and longitude must be provided together");
        }

        this.latitude = latitude;
        this.longitude = longitude;
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

    public void markDiscoveryProfileCreated() {
        this.discoveryProfileCreated = true;
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

        if (rentGraceDays < 0 || rentGraceDays > MAX_RENT_GRACE_DAYS) {
            throw new ValidationException("Rent grace days must be between 0 and " + MAX_RENT_GRACE_DAYS);
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

    /**
     * Floor of five days on the notice period.
     *
     * <p>Zero was accepted and meant "leave today", which no real property
     * offers — and it makes the notice-driven exit date meaningless. Five is
     * deliberately below the fifteen most properties use, so the rule is a
     * backstop rather than a policy the app imposes.
     */
    /**
     * Sets the notice period, defaulting to one month.
     *
     * <p>There is no range check left to write: the enum has no invalid members,
     * which is most of the reason it replaced a free-form integer.
     */
    private void updateExitPolicy(NoticePeriod noticePeriod) {
        this.noticePeriod = noticePeriod != null ? noticePeriod : NoticePeriod.ONE_MONTH;
    }

    /**
     * Replaces the property's exit policies — the damage-charge schedule and the
     * move-out checklist. A null list clears that policy; damage charges are
     * pre-validated as {@link PropertyDamageCharge} instances by the caller.
     */
    public void updateExitPolicies(
            List<PropertyDamageCharge> damageCharges,
            List<String> exitChecklist,
            String prematureExitPolicy) {
        this.prematureExitPolicy = clean(prematureExitPolicy);
        updateExitPolicies(damageCharges, exitChecklist);
    }

    public void updateExitPolicies(List<PropertyDamageCharge> damageCharges, List<String> exitChecklist) {
        this.damageCharges.clear();
        if (damageCharges != null) {
            if (damageCharges.size() > MAX_DAMAGE_CHARGES) {
                throw new ValidationException("A property can have at most 50 damage charges");
            }
            this.damageCharges.addAll(damageCharges);
        }

        this.exitChecklist.clear();
        if (exitChecklist != null) {
            if (exitChecklist.size() > MAX_EXIT_CHECKLIST_ITEMS) {
                throw new ValidationException("A property can have at most 30 exit checklist items");
            }
            for (String item : exitChecklist) {
                String normalized = item == null ? "" : item.trim();
                if (normalized.isBlank()) {
                    continue;
                }
                if (normalized.length() > MAX_EXIT_CHECKLIST_ITEM_LENGTH) {
                    throw new ValidationException("Exit checklist item must be at most 120 characters");
                }
                this.exitChecklist.add(normalized);
            }
        }
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

    private String normalizeState(String state) {
        if (state == null) {
            return null;
        }

        String normalized = state.trim();
        if (normalized.length() > 80) {
            throw new ValidationException("State must be at most 80 characters");
        }

        return normalized.isBlank() ? null : normalized;
    }

    private String normalizeArea(String area) {
        if (area == null || area.isBlank()) {
            throw new ValidationException("Area is required");
        }

        String normalized = area.trim();
        if (normalized.length() > 120) {
            throw new ValidationException("Area must be at most 120 characters");
        }

        return normalized;
    }

    private static String clean(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
