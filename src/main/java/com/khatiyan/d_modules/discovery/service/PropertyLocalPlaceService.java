package com.khatiyan.d_modules.discovery.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.discovery.api.dto.CreatePropertyLocalPlaceRequest;
import com.khatiyan.d_modules.discovery.api.dto.LocalPlacesMapResponse;
import com.khatiyan.d_modules.discovery.api.dto.PropertyLocalPlaceResponse;
import com.khatiyan.d_modules.discovery.api.dto.UpdatePropertyLocalPlaceRequest;
import com.khatiyan.d_modules.discovery.model.LocalPlaceSubcategory;
import com.khatiyan.d_modules.discovery.model.PropertyLocalPlace;
import com.khatiyan.d_modules.discovery.repository.LocalPlaceSubcategoryRepository;
import com.khatiyan.d_modules.discovery.repository.PropertyLocalPlaceRepository;
import com.khatiyan.d_modules.geo.GeoModule;
import com.khatiyan.d_modules.geo.LandmarkKind;
import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class PropertyLocalPlaceService {

    /** Mappls Nearby looks no further than 10 km; a tenant map wants less. */
    private static final int LIVE_REACH_METERS = 5_000;

    private static final int MAX_LIVE_RESULTS = 20;

    /**
     * The chips under the search box — the everyday "what is around me" asks.
     *
     * <p>Deliberately the errands rather than the move-in questions. Somebody
     * already living here wants a chemist tonight, not the nearest university.
     * Search is NOT limited to these: any phrase goes through the same two
     * paths, a category code or a named-place lookup.
     */
    private static final List<LocalPlacesMapResponse.SuggestedCategory> SUGGESTED_CATEGORIES = List.of(
            new LocalPlacesMapResponse.SuggestedCategory("Pharmacy", "pharmacy"),
            new LocalPlacesMapResponse.SuggestedCategory("ATM", "atm"),
            new LocalPlacesMapResponse.SuggestedCategory("Bank", "bank"),
            new LocalPlacesMapResponse.SuggestedCategory("Restaurant", "restaurant"),
            new LocalPlacesMapResponse.SuggestedCategory("Petrol pump", "petrol pump"),
            new LocalPlacesMapResponse.SuggestedCategory("Police", "police station"));


    private final PropertyLocalPlaceRepository localPlaceRepository;
    private final LocalPlaceSubcategoryRepository subcategoryRepository;
    private final PropertyModule propertyModule;
    private final DiscoveryAccessPolicy discoveryAccessPolicy;
    private final TenancyModule tenancyModule;
    private final GeoModule geoModule;

    public PropertyLocalPlaceService(
            PropertyLocalPlaceRepository localPlaceRepository,
            LocalPlaceSubcategoryRepository subcategoryRepository,
            PropertyModule propertyModule,
            DiscoveryAccessPolicy discoveryAccessPolicy,
            TenancyModule tenancyModule,
            GeoModule geoModule) {
        this.localPlaceRepository = localPlaceRepository;
        this.subcategoryRepository = subcategoryRepository;
        this.propertyModule = propertyModule;
        this.discoveryAccessPolicy = discoveryAccessPolicy;
        this.tenancyModule = tenancyModule;
        this.geoModule = geoModule;
    }

    // Tenant side local discovery

    @Transactional(readOnly = true)
    public List<PropertyLocalPlaceResponse> listMyLocalPlaces(
            UUID tenantUserId,
            BigDecimal latitude,
            BigDecimal longitude) {
        TenancyResponse tenancy = tenancyModule.findActiveByUserId(tenantUserId)
                .orElseThrow(() -> new NotFoundException("ActiveTenancyForUser", tenantUserId));

        return listActiveLocalPlaces(tenancy.propertyId(), latitude, longitude);
    }

    /**
     * The tenant's map: their property, and the places management listed.
     *
     * <p>Distances are measured from the PROPERTY, not the device. A tenant
     * looking at a map of their own neighbourhood is asking how far things are
     * from home, and a device-based distance would change every time they
     * walked to the shops.
     *
     * <p>Live vendor results are not wired yet. The field is present and empty
     * rather than absent, so the screen can be built against the shape it will
     * keep — and `liveSearchAvailable` says which of "nothing matched" and "we
     * could not look" is true.
     */
    @Transactional(readOnly = true)
    public LocalPlacesMapResponse myLocalPlacesMap(UUID tenantUserId, String query) {
        TenancyResponse tenancy = tenancyModule.findActiveByUserId(tenantUserId)
                .orElseThrow(() -> new NotFoundException("ActiveTenancyForUser", tenantUserId));
        PropertyResponse property = propertyModule.getActiveProperty(tenancy.propertyId());

        List<PropertyLocalPlaceResponse> listed =
                listActiveLocalPlaces(property.id(), property.latitude(), property.longitude());

        String needle = query == null ? "" : query.trim().toLowerCase();
        if (!needle.isBlank()) {
            listed = listed.stream()
                    .filter(place -> matches(place, needle))
                    .toList();
        }

        LiveLookup live = liveResults(needle, property);

        return new LocalPlacesMapResponse(
                new LocalPlacesMapResponse.PropertyAnchor(
                        property.name(),
                        property.address(),
                        property.latitude(),
                        property.longitude()),
                listed,
                live.places(),
                live.answered(),
                SUGGESTED_CATEGORIES);
    }

    /** What the vendor said, and whether it said anything at all. */
    private record LiveLookup(List<LocalPlacesMapResponse.LivePlace> places, boolean answered) {
        static LiveLookup unavailable() {
            return new LiveLookup(List.of(), false);
        }
    }

    /**
     * Anything the person types, resolved two ways.
     *
     * <p>A KIND of place — "pharmacy", "atm", "metro" — goes to Mappls Nearby
     * by category code, which is what returns everything of that kind around
     * the property. Anything else is a NAME and goes to autosuggest biased to
     * the property. The chips are only the common asks: this path takes any
     * phrase.
     */
    private LiveLookup liveResults(String needle, PropertyResponse property) {
        if (needle.isBlank() || property.latitude() == null || property.longitude() == null) {
            return LiveLookup.unavailable();
        }
        double lat = property.latitude().doubleValue();
        double lng = property.longitude().doubleValue();

        Optional<LandmarkKind> kind = LandmarkKind.of(needle);
        if (kind.isPresent() && kind.get().mapplsCodes() != null) {
            return geoModule.nearbyAnswered(kind.get().mapplsCodes(), lat, lng, LIVE_REACH_METERS)
                    .map(places -> new LiveLookup(
                            places.stream()
                                    .map(place -> new LocalPlacesMapResponse.LivePlace(
                                            place.name(),
                                            place.address(),
                                            place.eLoc(),
                                            place.distanceMeters(),
                                            null,
                                            null))
                                    .toList(),
                            true))
                    .orElseGet(LiveLookup::unavailable);
        }

        List<GeoSuggestionResponse> named = geoModule.systemSearchNear(needle, lat, lng);
        if (named.isEmpty()) {
            // The chain answers with an empty list both when it found nothing
            // and when no vendor could be reached, so this cannot tell them
            // apart. Reported as answered-with-nothing: the honest failure here
            // is a name that does not exist, which is far commoner.
            return new LiveLookup(List.of(), true);
        }
        return new LiveLookup(
                named.stream()
                        .limit(MAX_LIVE_RESULTS)
                        .map(place -> new LocalPlacesMapResponse.LivePlace(
                                place.name(),
                                place.address(),
                                place.providerPlaceId(),
                                place.distanceMeters(),
                                place.latitude() == null ? null : BigDecimal.valueOf(place.latitude()),
                                place.longitude() == null ? null : BigDecimal.valueOf(place.longitude())))
                        .toList(),
                true);
    }

    /** Name, address or any of the place's category names. */
    private static boolean matches(PropertyLocalPlaceResponse place, String needle) {
        if (place.name() != null && place.name().toLowerCase().contains(needle)) {
            return true;
        }
        if (place.addressText() != null && place.addressText().toLowerCase().contains(needle)) {
            return true;
        }
        return place.subcategoryNames().stream()
                .anyMatch(name -> name != null && name.toLowerCase().contains(needle));
    }

    // Owner/manager side local discovery management

    @Transactional(readOnly = true)
    public List<PropertyLocalPlaceResponse> listManagedLocalPlaces(
            UUID actorUserId,
            UUID propertyId,
            BigDecimal latitude,
            BigDecimal longitude) {
        discoveryAccessPolicy.ensureCanViewNearbyPlaces(actorUserId, propertyId);
        return listActiveLocalPlaces(propertyId, latitude, longitude);
    }

    @Transactional
    public PropertyLocalPlaceResponse createLocalPlace(
            UUID actorUserId,
            UUID propertyId,
            CreatePropertyLocalPlaceRequest request) {
        discoveryAccessPolicy.ensureCanManageNearbyPlaces(actorUserId, propertyId);

        PropertyLocalPlace place = PropertyLocalPlace.create(
                propertyId,
                request.name(),
                request.subcategoryIds(),
                request.description(),
                request.phone(),
                request.addressText(),
                request.latitude(),
                request.longitude(),
                request.directionsUrl(),
                request.photoUrl(),
                Boolean.TRUE.equals(request.ownerRecommended()));

        PropertyLocalPlace saved = localPlaceRepository.save(place);
        log.info("Property local place created placeId={} propertyId={} actorUserId={}",
                saved.getId(),
                propertyId,
                actorUserId);

        return toLocalPlaceResponse(saved, null, null);
    }

    @Transactional
    public PropertyLocalPlaceResponse updateLocalPlace(
            UUID actorUserId,
            UUID propertyId,
            UUID placeId,
            UpdatePropertyLocalPlaceRequest request) {
        discoveryAccessPolicy.ensureCanManageNearbyPlaces(actorUserId, propertyId);

        PropertyLocalPlace place = getActiveLocalPlace(placeId);
        ensurePlaceBelongsToProperty(place, propertyId);
        place.update(
                request.name(),
                request.subcategoryIds(),
                request.description(),
                request.phone(),
                request.addressText(),
                request.latitude(),
                request.longitude(),
                request.directionsUrl(),
                request.photoUrl(),
                Boolean.TRUE.equals(request.ownerRecommended()));

        log.info("Property local place updated placeId={} propertyId={} actorUserId={}",
                placeId,
                propertyId,
                actorUserId);

        return toLocalPlaceResponse(place, null, null);
    }

    @Transactional
    public void deleteLocalPlace(UUID actorUserId, UUID propertyId, UUID placeId) {
        discoveryAccessPolicy.ensureCanManageNearbyPlaces(actorUserId, propertyId);

        PropertyLocalPlace place = getActiveLocalPlace(placeId);
        ensurePlaceBelongsToProperty(place, propertyId);
        place.deactivate();

        log.info("Property local place deactivated placeId={} propertyId={} actorUserId={}",
                placeId,
                propertyId,
                actorUserId);
    }

    /**
     * Active places for a property as responses (distance-sorted), with no access
     * check — callers (search service) resolve and authorise the property first.
     */
    @Transactional(readOnly = true)
    public List<PropertyLocalPlaceResponse> listActiveForProperty(
            UUID propertyId, BigDecimal latitude, BigDecimal longitude) {
        return listActiveLocalPlaces(propertyId, latitude, longitude);
    }

    private PropertyLocalPlace getActiveLocalPlace(UUID placeId) {
        return localPlaceRepository.findActiveById(placeId)
                .orElseThrow(() -> new NotFoundException("PropertyLocalPlace", placeId));
    }

    private List<PropertyLocalPlaceResponse> listActiveLocalPlaces(
            UUID propertyId,
            BigDecimal latitude,
            BigDecimal longitude) {
        return localPlaceRepository.findActiveByPropertyId(propertyId)
                .stream()
                .map(place -> toLocalPlaceResponse(place, latitude, longitude))
                .sorted(localPlaceDistanceComparator())
                .toList();
    }

    private PropertyLocalPlaceResponse toLocalPlaceResponse(
            PropertyLocalPlace place,
            BigDecimal latitude,
            BigDecimal longitude) {
        Double distanceKm = DiscoveryGeoSupport.distanceKm(
                latitude,
                longitude,
                place.getLatitude(),
                place.getLongitude());
        String directionsUrl = DiscoveryGeoSupport.directionsUrl(
                place.getLatitude(),
                place.getLongitude(),
                place.getDirectionsUrl());

        List<UUID> subcategoryIds = new ArrayList<>(place.getSubcategoryIds());
        Map<UUID, String> names = subcategoryRepository.findByIdIn(subcategoryIds).stream()
                .collect(Collectors.toMap(LocalPlaceSubcategory::getId, LocalPlaceSubcategory::getName));
        List<String> subcategoryNames = subcategoryIds.stream()
                .map(id -> names.getOrDefault(id, ""))
                .filter(name -> !name.isBlank())
                .toList();

        return PropertyLocalPlaceResponse.from(place, subcategoryIds, subcategoryNames, distanceKm, directionsUrl);
    }

    private Comparator<PropertyLocalPlaceResponse> localPlaceDistanceComparator() {
        return Comparator
                .<PropertyLocalPlaceResponse, Double>comparing(
                        response -> response.distanceKm(),
                        Comparator.nullsLast((left, right) -> left.compareTo(right)))
                .thenComparing(response -> response.ownerRecommended(), Comparator.reverseOrder())
                .thenComparing(response -> response.name(), String.CASE_INSENSITIVE_ORDER);
    }

    private void ensurePlaceBelongsToProperty(PropertyLocalPlace place, UUID propertyId) {
        if (!place.getPropertyId().equals(propertyId)) {
            throw new NotFoundException("PropertyLocalPlace", place.getId());
        }
    }
}
