package com.khatiyan.d_modules.discovery.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.discovery.api.dto.CreatePropertyLocalPlaceRequest;
import com.khatiyan.d_modules.discovery.api.dto.PropertyLocalPlaceResponse;
import com.khatiyan.d_modules.discovery.api.dto.UpdatePropertyLocalPlaceRequest;
import com.khatiyan.d_modules.discovery.model.LocalPlaceSubcategory;
import com.khatiyan.d_modules.discovery.model.PropertyLocalPlace;
import com.khatiyan.d_modules.discovery.repository.LocalPlaceSubcategoryRepository;
import com.khatiyan.d_modules.discovery.repository.PropertyLocalPlaceRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class PropertyLocalPlaceService {

    private final PropertyLocalPlaceRepository localPlaceRepository;
    private final LocalPlaceSubcategoryRepository subcategoryRepository;
    private final PropertyModule propertyModule;
    private final TenancyModule tenancyModule;

    public PropertyLocalPlaceService(
            PropertyLocalPlaceRepository localPlaceRepository,
            LocalPlaceSubcategoryRepository subcategoryRepository,
            PropertyModule propertyModule,
            TenancyModule tenancyModule) {
        this.localPlaceRepository = localPlaceRepository;
        this.subcategoryRepository = subcategoryRepository;
        this.propertyModule = propertyModule;
        this.tenancyModule = tenancyModule;
    }

    // Tenant side local discovery

    @Transactional(readOnly = true)
    public List<PropertyLocalPlaceResponse> listMyLocalPlaces(
            UUID tenantUserId,
            BigDecimal latitude,
            BigDecimal longitude) {
        TenancyResponse tenancy = tenancyModule.findActiveByUserId(tenantUserId)
                .orElseThrow(() -> new NotFoundException("ActiveTenancyForUser_", tenantUserId));

        return listActiveLocalPlaces(tenancy.propertyId(), latitude, longitude);
    }

    // Owner/manager side local discovery management

    @Transactional(readOnly = true)
    public List<PropertyLocalPlaceResponse> listManagedLocalPlaces(
            UUID actorUserId,
            UUID propertyId,
            BigDecimal latitude,
            BigDecimal longitude) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        return listActiveLocalPlaces(propertyId, latitude, longitude);
    }

    @Transactional
    public PropertyLocalPlaceResponse createLocalPlace(
            UUID actorUserId,
            UUID propertyId,
            CreatePropertyLocalPlaceRequest request) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

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
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

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
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

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
                .orElseThrow(() -> new NotFoundException("PropertyLocalPlace_", placeId));
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
            throw new NotFoundException("PropertyLocalPlace_", place.getId());
        }
    }
}
