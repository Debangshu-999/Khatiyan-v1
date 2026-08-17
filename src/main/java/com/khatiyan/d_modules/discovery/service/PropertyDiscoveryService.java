package com.khatiyan.d_modules.discovery.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
    private final DiscoveryAccessPolicy discoveryAccessPolicy;
    private final AuthModule authModule;
    private final PropertyImageService propertyImageService;

    public PropertyDiscoveryService(
            PropertyDiscoveryProfileRepository discoveryProfileRepository,
            PropertyModule propertyModule,
            DiscoveryAccessPolicy discoveryAccessPolicy,
            AuthModule authModule,
            PropertyImageService propertyImageService) {
        this.discoveryProfileRepository = discoveryProfileRepository;
        this.propertyModule = propertyModule;
        this.discoveryAccessPolicy = discoveryAccessPolicy;
        this.authModule = authModule;
        this.propertyImageService = propertyImageService;
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

        // Geo layer: when the client supplies a search point, distances come
        // from the database (bounding-box prefilter on the partial btree index,
        // exact haversine refine). A radius additionally restricts candidates
        // to coordinated properties inside it.
        boolean hasSearchPoint = latitude != null && longitude != null;
        boolean hasRadius = hasSearchPoint && radiusKm != null && radiusKm > 0;
        Map<UUID, Double> distanceByPropertyId = hasSearchPoint
                ? visibleDistancesAround(latitude, longitude, radiusKm)
                : Map.of();

        // Candidate pool: every visible property whose owner-set discovery
        // filters match. Region/area matching is layered on top of this.
        List<PropertyDiscoveryProfile> visibleProfiles = discoveryProfileRepository.findAllVisible();
        // One query for every card's gallery. Fetching per card would be an N+1
        // across the whole result page.
        Map<UUID, List<String>> imagesByPropertyId = propertyImageService.imageUrlsFor(
                visibleProfiles.stream().map(PropertyDiscoveryProfile::getPropertyId).toList());

        List<PropertyDiscoveryCardResponse> candidates = visibleProfiles
                .stream()
                .map(profile -> toCardResponseIfPropertyVisible(
                        profile,
                        distanceByPropertyId.get(profile.getPropertyId()),
                        imagesByPropertyId.getOrDefault(profile.getPropertyId(), List.of())))
                .filter(response -> response != null)
                .filter(response -> !hasRadius || distanceByPropertyId.containsKey(response.propertyId()))
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
        // "nearby" fallback bucket is drawn from. When the client sent free text
        // with no resolved region (area unknown to the location catalog), try to
        // recognise a city or state inside the typed text itself so the nearby
        // bucket still works — e.g. "purba putiyari kolkata" scopes to Kolkata
        // even though the area matches nothing.
        String resolvedState = state;
        String resolvedCity = city;
        String resolvedLocality = locality;
        if (!hasText(state) && !hasText(city) && hasText(locality)) {
            RegionInference inference = inferRegionFromText(candidates, locality);
            if (inference != null) {
                resolvedCity = inference.city();
                resolvedState = inference.state();
                resolvedLocality = inference.remainingLocality();
                log.info("Discovery search inferred region city={} state={} remainingLocality='{}' from text='{}'",
                        resolvedCity, resolvedState, resolvedLocality, locality);
            }
        }

        boolean hasRegionScope = hasText(resolvedState) || hasText(resolvedCity);
        String scopeState = resolvedState;
        String scopeCity = resolvedCity;
        List<PropertyDiscoveryCardResponse> scoped = hasRegionScope
                ? candidates.stream().filter(response -> matchesRegionScope(response, scopeState, scopeCity)).toList()
                : candidates;

        // Exact bucket = properties in the searched area. Nearby bucket = the
        // rest of the region (same state/city) when an area was searched.
        // Rank by how many attribute preferences each property matches (most
        // first), then fall back to location relevance and name.
        Comparator<PropertyDiscoveryCardResponse> byMatchCount = Comparator
                .<PropertyDiscoveryCardResponse>comparingInt(response -> countAttributeMatches(
                        response, pgFor, preferredFor, foodIncluded, mealTypes, electricityIncluded, bathroomType, sharingTypes))
                .reversed();

        // With a search point, closer properties rank first among equal
        // attribute matches; without one this comparator is neutral.
        Comparator<PropertyDiscoveryCardResponse> byDistance = hasSearchPoint
                ? Comparator.<PropertyDiscoveryCardResponse>comparingDouble(
                        response -> response.distanceKm() == null ? Double.MAX_VALUE : response.distanceKm())
                : (first, second) -> 0;

        boolean hasArea = hasText(resolvedLocality);
        String areaText = resolvedLocality;
        List<PropertyDiscoveryCardResponse> exact = (hasArea
                ? scoped.stream().filter(response -> matchesLocality(response, areaText))
                : scoped.stream())
                .sorted(byMatchCount.thenComparing(byDistance).thenComparing(locationRelevanceComparator(areaText, resolvedCity, resolvedState)))
                .toList();

        List<PropertyDiscoveryCardResponse> nearby = (hasArea && hasRegionScope)
                ? scoped.stream()
                        .filter(response -> !matchesLocality(response, areaText))
                        .sorted(byMatchCount.thenComparing(byDistance).thenComparing(locationRelevanceComparator(null, resolvedCity, resolvedState)))
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
                .orElseThrow(() -> new NotFoundException("DiscoveryProperty", propertyId));

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
                DiscoveryGeoSupport.distanceKm(latitude, longitude, property.latitude(), property.longitude()),
                directionsUrl,
                startingRoomRentPaise,
                owner == null ? null : owner.fullName(),
                owner == null ? null : owner.phone(),
                propertyImageService.imageUrlsFor(propertyId));
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
        discoveryAccessPolicy.ensureCanViewListing(actorUserId, propertyId);

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
        discoveryAccessPolicy.ensureCanManageListing(actorUserId, propertyId);

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
        discoveryAccessPolicy.ensureCanManageListing(actorUserId, propertyId);

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
        discoveryAccessPolicy.ensureCanManageListing(actorUserId, propertyId);

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
        discoveryAccessPolicy.ensureCanManageListing(actorUserId, propertyId);

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

    private PropertyDiscoveryCardResponse toCardResponseIfPropertyVisible(
            PropertyDiscoveryProfile profile, Double distanceKm, List<String> imageUrls) {
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
                    distanceKm,
                    directionsUrl,
                    startingRoomRentPaise,
                    imageUrls);
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
    /**
     * Distances from a search point to every visible coordinated property,
     * bounding-box limited when a radius is given (rides the partial index) and
     * post-filtered to the exact radius. Insertion order = nearest first.
     */
    private Map<UUID, Double> visibleDistancesAround(BigDecimal latitude, BigDecimal longitude, Double radiusKm) {
        double lat = latitude.doubleValue();
        double lng = longitude.doubleValue();
        double minLat = -90, maxLat = 90, minLng = -180, maxLng = 180;
        if (radiusKm != null && radiusKm > 0) {
            double latDelta = radiusKm / 111.045d;
            double lngDelta = radiusKm / (111.320d * Math.max(0.09d, Math.cos(Math.toRadians(lat))));
            minLat = Math.max(-90, lat - latDelta);
            maxLat = Math.min(90, lat + latDelta);
            minLng = Math.max(-180, lng - lngDelta);
            maxLng = Math.min(180, lng + lngDelta);
        }
        Map<UUID, Double> distances = new LinkedHashMap<>();
        for (PropertyDiscoveryProfileRepository.VisiblePropertyDistance row
                : discoveryProfileRepository.findVisiblePropertyDistances(lat, lng, minLat, maxLat, minLng, maxLng)) {
            if (radiusKm == null || radiusKm <= 0 || (row.getDistanceKm() != null && row.getDistanceKm() <= radiusKm)) {
                distances.put(row.getPropertyId(), row.getDistanceKm());
            }
        }
        return distances;
    }

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
        // Location fields (area/city/state) match fuzzily — nobody knows the
        // canonical spelling of every locality ("Putiyari" must find "Putiary");
        // prose fields and pincode stay exact to avoid false positives.
        String[] rawTokens = locality.trim().toLowerCase().split("[,\\s]+");
        for (String token : rawTokens) {
            if (token.isBlank()) {
                continue;
            }

            boolean tokenMatched = fuzzyFieldMatch(response.area(), token)
                    || fuzzyFieldMatch(response.city(), token)
                    || fuzzyFieldMatch(response.state(), token)
                    || containsIgnoreCase(response.address(), token)
                    || containsIgnoreCase(response.pincode(), token)
                    || containsIgnoreCase(response.headline(), token)
                    || containsIgnoreCase(response.description(), token);

            if (!tokenMatched) {
                return false;
            }
        }

        return true;
    }

    /**
     * Recognises a known city (preferred) or state inside free search text by
     * scanning the candidate pool's own location values, so the typed text can
     * establish a region scope without the location catalog knowing the area.
     * Tokens are checked right to left — "purba putiyari kolkata" names the
     * city last. Returns null when nothing in the text looks like a region.
     */
    private RegionInference inferRegionFromText(List<PropertyDiscoveryCardResponse> candidates, String text) {
        List<String> tokens = new ArrayList<>(List.of(text.trim().toLowerCase().split("[,\\s]+")));
        tokens.removeIf(String::isBlank);

        for (int index = tokens.size() - 1; index >= 0; index--) {
            String token = tokens.get(index);
            if (token.length() < 3) {
                continue;
            }
            for (PropertyDiscoveryCardResponse candidate : candidates) {
                if (fuzzyFieldMatch(candidate.city(), token)) {
                    return new RegionInference(candidate.city(), null, remainingTokens(tokens, index));
                }
            }
            for (PropertyDiscoveryCardResponse candidate : candidates) {
                if (fuzzyFieldMatch(candidate.state(), token)) {
                    return new RegionInference(null, candidate.state(), remainingTokens(tokens, index));
                }
            }
        }
        return null;
    }

    private static String remainingTokens(List<String> tokens, int excludedIndex) {
        StringBuilder remaining = new StringBuilder();
        for (int index = 0; index < tokens.size(); index++) {
            if (index == excludedIndex) {
                continue;
            }
            if (remaining.length() > 0) {
                remaining.append(' ');
            }
            remaining.append(tokens.get(index));
        }
        return remaining.toString();
    }

    private record RegionInference(String city, String state, String remainingLocality) {
    }

    /**
     * True when the field contains the token, or any single word of the field
     * is within a small edit distance of it — typo tolerance scaled to token
     * length so short tokens stay exact.
     */
    private static boolean fuzzyFieldMatch(String fieldValue, String token) {
        if (fieldValue == null || fieldValue.isBlank() || token.isBlank()) {
            return false;
        }
        String normalizedField = fieldValue.toLowerCase();
        if (normalizedField.contains(token)) {
            return true;
        }
        int allowed = allowedEditDistance(token);
        if (allowed == 0) {
            return false;
        }
        for (String word : normalizedField.split("[,\\s]+")) {
            if (!word.isBlank() && editDistanceAtMost(word, token, allowed)) {
                return true;
            }
        }
        return false;
    }

    private static int allowedEditDistance(String token) {
        if (token.length() >= 6) {
            return 2;
        }
        if (token.length() >= 4) {
            return 1;
        }
        return 0;
    }

    /** Banded Levenshtein: true when distance(a, b) <= max, with early exit. */
    private static boolean editDistanceAtMost(String a, String b, int max) {
        if (Math.abs(a.length() - b.length()) > max) {
            return false;
        }
        int[] previous = new int[b.length() + 1];
        int[] current = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) {
            previous[j] = j;
        }
        for (int i = 1; i <= a.length(); i++) {
            current[0] = i;
            int rowMin = current[0];
            for (int j = 1; j <= b.length(); j++) {
                int substitution = previous[j - 1] + (a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1);
                current[j] = Math.min(substitution, Math.min(previous[j] + 1, current[j - 1] + 1));
                rowMin = Math.min(rowMin, current[j]);
            }
            if (rowMin > max) {
                return false;
            }
            int[] swap = previous;
            previous = current;
            current = swap;
        }
        return previous[b.length()] <= max;
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
