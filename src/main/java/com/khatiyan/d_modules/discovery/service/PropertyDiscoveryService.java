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

    public PropertyDiscoveryService(
            PropertyDiscoveryProfileRepository discoveryProfileRepository,
            PropertyModule propertyModule) {
        this.discoveryProfileRepository = discoveryProfileRepository;
        this.propertyModule = propertyModule;
    }

    // Public/user side property discovery

    @Transactional(readOnly = true)
    public PageResponse<PropertyDiscoveryCardResponse> searchVisibleProperties(
            String city,
            String locality,
            BigDecimal latitude,
            BigDecimal longitude,
            Double radiusKm,
            int page,
            int size) {
        List<PropertyDiscoveryCardResponse> responses = discoveryProfileRepository.findAllVisible()
                .stream()
                .map(profile -> toCardResponseIfPropertyVisible(profile, latitude, longitude))
                .filter(response -> response != null)
                .filter(response -> matchesCity(response, city))
                .filter(response -> matchesLocality(response, locality))
                .filter(response -> withinRadius(response, radiusKm))
                .sorted(propertyDistanceComparator())
                .toList();

        log.info("Discovery property search returned count={} city={} locality={}",
                responses.size(),
                city,
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

        return PropertyDiscoveryDetailResponse.from(property, profile, distanceKm, directionsUrl);
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

            return PropertyDiscoveryCardResponse.from(property, profile, distanceKm, directionsUrl);
        } catch (NotFoundException exception) {
            log.warn("Skipping discovery profile because property is not active propertyId={}",
                    profile.getPropertyId());
            return null;
        }
    }

    private boolean matchesCity(PropertyDiscoveryCardResponse response, String city) {
        if (city == null || city.isBlank()) {
            return true;
        }

        return response.city() != null && response.city().equalsIgnoreCase(city.trim());
    }

    private boolean matchesLocality(PropertyDiscoveryCardResponse response, String locality) {
        if (locality == null || locality.isBlank()) {
            return true;
        }

        String normalizedLocality = locality.trim().toLowerCase();
        return response.address() != null && response.address().toLowerCase().contains(normalizedLocality);
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
}
