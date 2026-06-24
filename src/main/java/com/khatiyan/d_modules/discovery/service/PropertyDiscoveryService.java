package com.khatiyan.d_modules.discovery.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryCardResponse;
import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryDetailResponse;
import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryProfileResponse;
import com.khatiyan.d_modules.discovery.api.dto.UpdatePropertyDiscoveryProfileRequest;
import com.khatiyan.d_modules.discovery.model.PropertyDiscoveryProfile;
import com.khatiyan.d_modules.discovery.repository.PropertyDiscoveryProfileRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.SharingType;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class PropertyDiscoveryService {

    private final PropertyDiscoveryProfileRepository discoveryProfileRepository;
    private final PropertyModule propertyModule;
    private final AuthModule authModule;

    public PropertyDiscoveryService(
            PropertyDiscoveryProfileRepository discoveryProfileRepository,
            PropertyModule propertyModule,
            AuthModule authModule) {
        this.discoveryProfileRepository = discoveryProfileRepository;
        this.propertyModule = propertyModule;
        this.authModule = authModule;
    }

    // Public/user side property discovery

    @Transactional(readOnly = true)
    public PageResponse<PropertyDiscoveryCardResponse> searchVisibleProperties(
            String state,
            String city,
            String countryCode,
            String locality,
            BigDecimal latitude,
            BigDecimal longitude,
            Double radiusKm,
            PgFor pgFor,
            Long minRentPaise,
            Long maxRentPaise,
            PreferredTenantType preferredFor,
            Boolean foodIncluded,
            Set<MealType> mealTypes,
            Boolean electricityIncluded,
            BathroomType bathroomType,
            Set<SharingType> sharingTypes,
            int page,
            int size) {
        // Every listed property is in India. A resolved foreign country code
        // means the device is outside India, so there is nothing to show here.
        if (isForeignCountry(countryCode)) {
            log.info("Discovery property search skipped for foreign country countryCode={} state={} locality={}",
                    countryCode, state, locality);
            return PageResponse.of(List.of(), page, size);
        }

        // Candidate pool: every visible property whose owner-set discovery
        // filters match. Region/area matching is layered on top of this.
        List<PropertyDiscoveryCardResponse> candidates = discoveryProfileRepository.findAllVisible()
                .stream()
                .map(this::toCardResponseIfPropertyVisible)
                .filter(response -> response != null)
                .filter(response -> matchesDiscoveryFilters(
                        response,
                        pgFor,
                        minRentPaise,
                        maxRentPaise,
                        preferredFor,
                        foodIncluded,
                        mealTypes,
                        electricityIncluded,
                        bathroomType,
                        sharingTypes))
                .toList();

        // Region scope = the same state (preferred) or city. This is what the
        // "nearby" fallback bucket is drawn from. Without a region we can only
        // honour the free-text/area match (no nearby bucket).
        boolean hasRegionScope = hasText(state) || hasText(city);
        List<PropertyDiscoveryCardResponse> scoped = hasRegionScope
                ? candidates.stream().filter(response -> matchesRegionScope(response, state, city)).toList()
                : candidates;

        // Exact bucket = properties in the searched area. Nearby bucket = the
        // rest of the region (same state/city) when an area was searched.
        // Rank by how many attribute preferences each property matches (most
        // first), then fall back to location relevance and name.
        Comparator<PropertyDiscoveryCardResponse> byMatchCount = Comparator
                .<PropertyDiscoveryCardResponse>comparingInt(response -> countAttributeMatches(
                        response, pgFor, preferredFor, foodIncluded, mealTypes, electricityIncluded, bathroomType, sharingTypes))
                .reversed();

        boolean hasArea = hasText(locality);
        List<PropertyDiscoveryCardResponse> exact = (hasArea
                ? scoped.stream().filter(response -> matchesLocality(response, locality))
                : scoped.stream())
                .sorted(byMatchCount.thenComparing(locationRelevanceComparator(locality, city, state)))
                .toList();

        List<PropertyDiscoveryCardResponse> nearby = (hasArea && hasRegionScope)
                ? scoped.stream()
                        .filter(response -> !matchesLocality(response, locality))
                        .sorted(byMatchCount.thenComparing(locationRelevanceComparator(null, city, state)))
                        .toList()
                : List.of();

        // Single ordered list, exact matches first then nearby. The client
        // re-splits on the searched area to label the two sections; ordering
        // here keeps exact matches first if the result set is ever paged.
        List<PropertyDiscoveryCardResponse> responses = new ArrayList<>(exact.size() + nearby.size());
        responses.addAll(exact);
        responses.addAll(nearby);

        log.info("Discovery property search exact={} nearby={} state={} city={} countryCode={} locality={}",
                exact.size(),
                nearby.size(),
                state,
                city,
                countryCode,
                locality);

        return PageResponse.of(responses, page, size);
    }

    @Transactional(readOnly = true)
    public PropertyDiscoveryDetailResponse getVisibleProperty(
            UUID propertyId,
            BigDecimal latitude,
            BigDecimal longitude) {
        PropertyDiscoveryProfile profile = discoveryProfileRepository.findVisibleByPropertyId(propertyId)
                .orElseThrow(() -> new NotFoundException("DiscoveryProperty_", propertyId));

        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        String directionsUrl = DiscoveryGeoSupport.propertyDirectionsUrl(
                property.latitude(),
                property.longitude(),
                property.address(),
                property.area(),
                property.city(),
                property.state(),
                property.pincode());
        Long startingRoomRentPaise = propertyModule.findLowestActiveRoomRentPaise(propertyId);
        UserSummaryResponse owner = authModule.findById(property.ownerId())
                .orElse(null);

        return PropertyDiscoveryDetailResponse.from(
                property,
                profile,
                null,
                directionsUrl,
                startingRoomRentPaise,
                owner == null ? null : owner.fullName(),
                owner == null ? null : owner.phone());
    }

    // Owner/manager side discovery profile management

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void createDraftProfileAfterPropertyCreation(
            UUID propertyId,
            String headline,
            String description,
            String profileImageUrl) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        PropertyDiscoveryProfile profile = getOrCreateProfile(
                property,
                defaultText(headline, property.name() + " in " + property.city()),
                defaultText(description, defaultDescription(property)),
                profileImageUrl);

        profile.update(
                defaultText(headline, property.name() + " in " + property.city()),
                defaultText(description, defaultDescription(property)),
                profileImageUrl,
                true,
                true);
        propertyModule.markDiscoveryProfileCreated(propertyId);
    }

    @Transactional
    public PropertyDiscoveryProfileResponse getManagedProfile(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        PropertyDiscoveryProfile profile = getOrCreateProfile(
                property,
                property.name() + " in " + property.city(),
                defaultDescription(property),
                null);
        return PropertyDiscoveryProfileResponse.from(profile);
    }

    @Transactional
    public PropertyDiscoveryProfileResponse updateManagedProfile(
            UUID actorUserId,
            UUID propertyId,
            UpdatePropertyDiscoveryProfileRequest request) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        PropertyDiscoveryProfile profile = getOrCreateProfile(
                property,
                property.name() + " in " + property.city(),
                defaultDescription(property),
                null);
        profile.update(
                request.headline(),
                request.description(),
                request.profileImageUrl(),
                request.showOwnerContact(),
                request.showManagerContact());

        log.info("Discovery profile updated propertyId={} actorUserId={}", propertyId, actorUserId);
        return PropertyDiscoveryProfileResponse.from(profile);
    }

    @Transactional
    public PropertyDiscoveryProfileResponse publishProfile(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        PropertyDiscoveryProfile profile = getOrCreateProfile(
                property,
                property.name() + " in " + property.city(),
                defaultDescription(property),
                null);
        profile.publish();

        log.info("Discovery profile published propertyId={} actorUserId={}", propertyId, actorUserId);
        return PropertyDiscoveryProfileResponse.from(profile);
    }

    @Transactional
    public PropertyDiscoveryProfileResponse unpublishProfile(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        PropertyDiscoveryProfile profile = getOrCreateProfile(
                property,
                property.name() + " in " + property.city(),
                defaultDescription(property),
                null);
        profile.unpublish();

        log.info("Discovery profile unpublished propertyId={} actorUserId={}", propertyId, actorUserId);
        return PropertyDiscoveryProfileResponse.from(profile);
    }

    @Transactional
    public void unlistProfileForPropertyDeactivation(UUID propertyId) {
        discoveryProfileRepository.findActiveByPropertyId(propertyId)
                .ifPresent(profile -> {
                    profile.unpublish();
                    log.info("Discovery profile unlisted for property deactivation propertyId={}", propertyId);
                });
    }

    @Transactional
    public PropertyDiscoveryProfileResponse repairManagedProfile(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        PropertyDiscoveryProfile profile = getOrCreateProfile(
                property,
                property.name() + " in " + property.city(),
                defaultDescription(property),
                null);

        profile.repairRequiredDraftFields(
                property.name() + " in " + property.city(),
                defaultDescription(property));
        propertyModule.markDiscoveryProfileCreated(propertyId);

        log.info("Discovery profile repaired propertyId={} actorUserId={}", propertyId, actorUserId);
        return PropertyDiscoveryProfileResponse.from(profile);
    }

    private PropertyDiscoveryProfile getOrCreateProfile(
            PropertyResponse property,
            String headline,
            String description,
            String profileImageUrl) {
        return discoveryProfileRepository.findActiveByPropertyId(property.id())
                .orElseGet(() -> discoveryProfileRepository.save(PropertyDiscoveryProfile.createDraft(
                        property.id(),
                        headline,
                        description,
                        profileImageUrl)));
    }

    private String defaultText(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }

        return value;
    }

    private String defaultDescription(PropertyResponse property) {
        return "Located at " + property.address() + ", " + property.city() + " " + property.pincode() + ".";
    }

    private PropertyDiscoveryCardResponse toCardResponseIfPropertyVisible(PropertyDiscoveryProfile profile) {
        try {
            PropertyResponse property = propertyModule.getActiveProperty(profile.getPropertyId());
            String directionsUrl = DiscoveryGeoSupport.propertyDirectionsUrl(
                    property.latitude(),
                    property.longitude(),
                    property.address(),
                    property.area(),
                    property.city(),
                    property.state(),
                    property.pincode());

            Long startingRoomRentPaise = propertyModule.findLowestActiveRoomRentPaise(property.id());

            return PropertyDiscoveryCardResponse.from(
                    property,
                    profile,
                    null,
                    directionsUrl,
                    startingRoomRentPaise);
        } catch (NotFoundException exception) {
            log.warn("Skipping discovery profile because property is not active propertyId={}",
                    profile.getPropertyId());
            return null;
        }
    }

    private boolean matchesStateText(PropertyDiscoveryCardResponse response, String state) {
        if (!hasText(state)) {
            return true;
        }

        String normalizedState = normalizeSearchText(state);
        return containsIgnoreCase(response.state(), normalizedState)
                || containsIgnoreCase(response.area(), normalizedState)
                || containsIgnoreCase(response.address(), normalizedState)
                || containsIgnoreCase(response.headline(), normalizedState)
                || containsIgnoreCase(response.description(), normalizedState);
    }

    // Region scope for the "nearby" fallback: prefer the city so nearby means
    // "elsewhere in the same city", and fall back to the state only when no
    // city is known.
    private boolean matchesRegionScope(PropertyDiscoveryCardResponse response, String state, String city) {
        if (hasText(city)) {
            return matchesCityText(response, city);
        }

        return matchesStateText(response, state);
    }

    private boolean isForeignCountry(String countryCode) {
        return hasText(countryCode) && !countryCode.trim().equalsIgnoreCase("IN");
    }

    private boolean matchesCityText(PropertyDiscoveryCardResponse response, String city) {
        if (!hasText(city)) {
            return true;
        }

        String normalizedCity = normalizeSearchText(city);
        return containsIgnoreCase(response.city(), normalizedCity)
                || containsIgnoreCase(response.area(), normalizedCity)
                || containsIgnoreCase(response.address(), normalizedCity);
    }

    private boolean matchesLocality(PropertyDiscoveryCardResponse response, String locality) {
        if (locality == null || locality.isBlank()) {
            return true;
        }

        // Token-AND match so single-line searches like "Madhapur, Hyderabad"
        // work: each non-empty token must appear in at least one of the
        // searchable fields. Tokens are split on commas and whitespace.
        String[] rawTokens = locality.trim().toLowerCase().split("[,\\s]+");
        for (String token : rawTokens) {
            if (token.isBlank()) {
                continue;
            }

            boolean tokenMatched = containsIgnoreCase(response.area(), token)
                    || containsIgnoreCase(response.address(), token)
                    || containsIgnoreCase(response.city(), token)
                    || containsIgnoreCase(response.state(), token)
                    || containsIgnoreCase(response.pincode(), token)
                    || containsIgnoreCase(response.headline(), token)
                    || containsIgnoreCase(response.description(), token);

            if (!tokenMatched) {
                return false;
            }
        }

        return true;
    }

    private boolean containsIgnoreCase(String value, String normalizedSearchText) {
        return value != null && normalizeSearchText(value).contains(normalizedSearchText);
    }

    private String normalizeSearchText(String value) {
        return value.trim().toLowerCase();
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private boolean matchesDiscoveryFilters(
            PropertyDiscoveryCardResponse response,
            PgFor pgFor,
            Long minRentPaise,
            Long maxRentPaise,
            PreferredTenantType preferredFor,
            Boolean foodIncluded,
            Set<MealType> mealTypes,
            Boolean electricityIncluded,
            BathroomType bathroomType,
            Set<SharingType> sharingTypes) {
        // Budget (and the location scope applied separately) are hard filters —
        // results must always comply.
        if (!matchesRentRange(response.startingRoomRentPaise(), minRentPaise, maxRentPaise)) {
            return false;
        }
        // The remaining attribute filters are OR preferences: when any are set, a
        // property qualifies if it matches at least one. Result ranking by match
        // count is applied during sorting.
        int activeAttributeFilters = countActiveAttributeFilters(
                pgFor, preferredFor, foodIncluded, mealTypes, electricityIncluded, bathroomType, sharingTypes);
        if (activeAttributeFilters == 0) {
            return true;
        }
        return countAttributeMatches(
                response, pgFor, preferredFor, foodIncluded, mealTypes, electricityIncluded, bathroomType, sharingTypes) > 0;
    }

    private int countActiveAttributeFilters(
            PgFor pgFor,
            PreferredTenantType preferredFor,
            Boolean foodIncluded,
            Set<MealType> mealTypes,
            Boolean electricityIncluded,
            BathroomType bathroomType,
            Set<SharingType> sharingTypes) {
        int count = 0;
        if (pgFor != null && pgFor != PgFor.ANYONE) count++;
        if (preferredFor != null && preferredFor != PreferredTenantType.ANYONE) count++;
        if (foodIncluded != null) count++;
        if (mealTypes != null && !mealTypes.isEmpty()) count++;
        if (electricityIncluded != null) count++;
        if (bathroomType != null) count++;
        if (sharingTypes != null && !sharingTypes.isEmpty()) count++;
        return count;
    }

    private int countAttributeMatches(
            PropertyDiscoveryCardResponse response,
            PgFor pgFor,
            PreferredTenantType preferredFor,
            Boolean foodIncluded,
            Set<MealType> mealTypes,
            Boolean electricityIncluded,
            BathroomType bathroomType,
            Set<SharingType> sharingTypes) {
        int matches = 0;
        if (pgFor != null && pgFor != PgFor.ANYONE && matchesPgFor(response.pgFor(), pgFor)) matches++;
        if (preferredFor != null && preferredFor != PreferredTenantType.ANYONE
                && matchesPreferredFor(response.preferredFor(), preferredFor)) matches++;
        if (foodIncluded != null && response.foodIncluded() == foodIncluded) matches++;
        if (mealTypes != null && !mealTypes.isEmpty() && response.includedMeals().containsAll(mealTypes)) matches++;
        if (electricityIncluded != null && response.electricityIncluded() == electricityIncluded) matches++;
        if (bathroomType != null && response.bathroomType() == bathroomType) matches++;
        if (sharingTypes != null && !sharingTypes.isEmpty() && hasAny(response.availableSharingTypes(), sharingTypes)) matches++;
        return matches;
    }

    private boolean matchesPgFor(PgFor propertyValue, PgFor requestedValue) {
        return requestedValue == null
                || requestedValue == PgFor.ANYONE
                || propertyValue == requestedValue
                || propertyValue == PgFor.ANYONE;
    }

    private boolean matchesPreferredFor(PreferredTenantType propertyValue, PreferredTenantType requestedValue) {
        return requestedValue == null
                || requestedValue == PreferredTenantType.ANYONE
                || propertyValue == requestedValue
                || propertyValue == PreferredTenantType.ANYONE;
    }

    private boolean matchesRentRange(Long rentPaise, Long minRentPaise, Long maxRentPaise) {
        if (minRentPaise == null && maxRentPaise == null) {
            return true;
        }
        if (rentPaise == null) {
            return false;
        }
        if (minRentPaise != null && rentPaise < minRentPaise) {
            return false;
        }
        return maxRentPaise == null || rentPaise <= maxRentPaise;
    }

    private <T> boolean hasAny(Set<T> propertyValues, Set<T> requestedValues) {
        Set<T> intersection = new HashSet<>(propertyValues);
        intersection.retainAll(requestedValues);
        return !intersection.isEmpty();
    }

    private Comparator<PropertyDiscoveryCardResponse> locationRelevanceComparator(String locality, String city, String state) {
        return Comparator
                .<PropertyDiscoveryCardResponse>comparingInt(response -> locationRelevanceScore(response, locality, city, state))
                .reversed()
                .thenComparing(response -> response.name(), String.CASE_INSENSITIVE_ORDER);
    }

    private int locationRelevanceScore(
            PropertyDiscoveryCardResponse response,
            String locality,
            String city,
            String state) {
        int score = 0;
        if (hasText(locality) && matchesLocality(response, locality)) {
            score = score + 100;
        }
        if (hasText(city) && matchesCityText(response, city)) {
            score = score + 50;
        }
        if (hasText(state) && matchesStateText(response, state)) {
            score = score + 10;
        }
        return score;
    }
}
