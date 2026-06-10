package com.khatiyan.d_modules.discovery.service;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
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
            int page,
            int size) {
        List<PropertyDiscoveryCardResponse> allResponses = discoveryProfileRepository.findAllVisible()
                .stream()
                .map(profile -> toCardResponseIfPropertyVisible(profile, latitude, longitude))
                .filter(response -> response != null)
                .toList();

        List<PropertyDiscoveryCardResponse> responses = allResponses.stream()
                .filter(response -> matchesStateForSearch(response, state, city))
                .filter(response -> matchesCityText(response, city))
                .filter(response -> matchesLocality(response, locality))
                .filter(response -> withinRadius(response, radiusKm))
                .sorted(locationRelevanceComparator(locality, city, state))
                .toList();

        String fallbackMode = "NONE";
        if (responses.isEmpty() && hasText(city)) {
            responses = allResponses.stream()
                    .filter(response -> matchesStateForSearch(response, state, city))
                    .filter(response -> matchesCityText(response, city))
                    .sorted(locationRelevanceComparator(locality, city, state))
                    .toList();
            fallbackMode = "CITY";
        }

        if (responses.isEmpty() && !hasText(city) && hasText(state)) {
            responses = allResponses.stream()
                    .filter(response -> matchesStateText(response, state))
                    .sorted(locationRelevanceComparator(locality, city, state))
                    .toList();
            fallbackMode = "STATE";
        }

        if (responses.isEmpty() && !hasText(city) && !hasText(state) && isIndiaOrUnknown(countryCode) && latitude != null && longitude != null) {
            responses = allResponses.stream()
                    .filter(response -> response.distanceKm() != null)
                    .sorted(propertyDistanceComparator())
                    .toList();
            fallbackMode = "NEAREST";
        }

        log.info("Discovery property search returned count={} state={} city={} countryCode={} locality={} fallback={}",
                responses.size(),
                state,
                city,
                countryCode,
                locality,
                fallbackMode);

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
        Double distanceKm = DiscoveryGeoSupport.distanceKm(
                latitude,
                longitude,
                property.latitude(),
                property.longitude());
        String directionsUrl = DiscoveryGeoSupport.propertyDirectionsUrl(
                property.latitude(),
                property.longitude(),
                property.address(),
                property.city(),
                property.pincode());
        Long startingRoomRentPaise = propertyModule.findLowestActiveRoomRentPaise(propertyId);
        UserSummaryResponse owner = authModule.findById(property.ownerId())
                .orElse(null);

        return PropertyDiscoveryDetailResponse.from(
                property,
                profile,
                distanceKm,
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

    private PropertyDiscoveryCardResponse toCardResponseIfPropertyVisible(
            PropertyDiscoveryProfile profile,
            BigDecimal latitude,
            BigDecimal longitude) {
        try {
            PropertyResponse property = propertyModule.getActiveProperty(profile.getPropertyId());
            Double distanceKm = DiscoveryGeoSupport.distanceKm(
                    latitude,
                    longitude,
                    property.latitude(),
                    property.longitude());
            String directionsUrl = DiscoveryGeoSupport.propertyDirectionsUrl(
                    property.latitude(),
                    property.longitude(),
                    property.address(),
                    property.city(),
                    property.pincode());

            Long startingRoomRentPaise = propertyModule.findLowestActiveRoomRentPaise(property.id());

            return PropertyDiscoveryCardResponse.from(
                    property,
                    profile,
                    distanceKm,
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
                || containsIgnoreCase(response.address(), normalizedState)
                || containsIgnoreCase(response.headline(), normalizedState)
                || containsIgnoreCase(response.description(), normalizedState);
    }

    private boolean matchesStateForSearch(PropertyDiscoveryCardResponse response, String state, String city) {
        if (!hasText(state)) {
            return true;
        }

        if (hasText(city) && !hasText(response.state())) {
            return true;
        }

        return matchesStateText(response, state);
    }

    private boolean matchesCityText(PropertyDiscoveryCardResponse response, String city) {
        if (!hasText(city)) {
            return true;
        }

        String normalizedCity = normalizeSearchText(city);
        return containsIgnoreCase(response.city(), normalizedCity)
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

            boolean tokenMatched = containsIgnoreCase(response.address(), token)
                    || containsIgnoreCase(response.city(), token)
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

    private boolean isIndiaOrUnknown(String countryCode) {
        return !hasText(countryCode) || "IN".equalsIgnoreCase(countryCode.trim());
    }

    private boolean withinRadius(PropertyDiscoveryCardResponse response, Double radiusKm) {
        if (radiusKm == null) {
            return true;
        }

        return response.distanceKm() != null && response.distanceKm() <= radiusKm;
    }

    private Comparator<PropertyDiscoveryCardResponse> propertyDistanceComparator() {
        return Comparator
                .<PropertyDiscoveryCardResponse, Double>comparing(
                        response -> response.distanceKm(),
                        Comparator.nullsLast((left, right) -> left.compareTo(right)))
                .thenComparing(response -> response.name(), String.CASE_INSENSITIVE_ORDER);
    }

    private Comparator<PropertyDiscoveryCardResponse> locationRelevanceComparator(String locality, String city, String state) {
        return Comparator
                .<PropertyDiscoveryCardResponse>comparingInt(response -> locationRelevanceScore(response, locality, city, state))
                .reversed()
                .thenComparing(propertyDistanceComparator());
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
