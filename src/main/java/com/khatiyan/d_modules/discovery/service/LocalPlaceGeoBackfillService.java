package com.khatiyan.d_modules.discovery.service;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.discovery.model.PropertyLocalPlace;
import com.khatiyan.d_modules.discovery.repository.PropertyLocalPlaceRepository;
import com.khatiyan.d_modules.geo.GeoModule;
import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.property.PropertyModule;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import lombok.extern.slf4j.Slf4j;

/**
 * Nightly convergence job for admin-curated local places that still lack
 * coordinates (created before the map picker). Geocodes from the place's
 * address text — or its name plus the property's city — in small batches, and
 * never overwrites a pinned point.
 */
@Slf4j
@Component
public class LocalPlaceGeoBackfillService {

    private final PropertyLocalPlaceRepository localPlaceRepository;
    private final PropertyModule propertyModule;
    private final GeoModule geoModule;
    private final int batchSize;

    public LocalPlaceGeoBackfillService(
            PropertyLocalPlaceRepository localPlaceRepository,
            PropertyModule propertyModule,
            GeoModule geoModule,
            @Value("${app.geo.backfill.batch-size:20}") int batchSize) {
        this.localPlaceRepository = localPlaceRepository;
        this.propertyModule = propertyModule;
        this.geoModule = geoModule;
        this.batchSize = batchSize;
    }

    @Scheduled(
            cron = "${app.geo.backfill.local-place-cron:0 15 1 * * *}",
            zone = "${app.geo.backfill.zone:Asia/Kolkata}")
    @SchedulerLock(name = "geo-backfillLocalPlaceCoordinates", lockAtMostFor = "PT15M", lockAtLeastFor = "PT15S")
    @Transactional
    public void backfillLocalPlaceCoordinates() {
        if (!geoModule.isLiveProvider()) {
            log.info("Local place geo backfill skipped: no live geocoding provider configured");
            return;
        }

        List<PropertyLocalPlace> candidates = localPlaceRepository.findByActiveTrueAndLatitudeIsNull();
        if (candidates.isEmpty()) {
            return;
        }

        int attempted = 0;
        int filled = 0;
        for (PropertyLocalPlace place : candidates) {
            if (attempted >= batchSize) {
                break;
            }
            attempted++;

            String query = placeQuery(place);
            if (query == null || query.length() < 2) {
                continue;
            }
            GeoSuggestionResponse best = geoModule.systemSearch(query).stream()
                    .filter(suggestion -> suggestion.latitude() != null && suggestion.longitude() != null)
                    .findFirst()
                    .orElse(null);
            if (best == null) {
                log.info("Local place geo backfill found no match placeId={} query='{}'", place.getId(), query);
                continue;
            }
            place.backfillCoordinates(
                    BigDecimal.valueOf(best.latitude()),
                    BigDecimal.valueOf(best.longitude()));
            filled++;
        }

        log.info(
                "Local place geo backfill completed pending={} attempted={} filled={}",
                candidates.size(),
                attempted,
                filled);
    }

    // Prefer the typed address; fall back to the place name anchored to the
    // property's city so "Ratnadeep Supermarket" doesn't match one in another state.
    private String placeQuery(PropertyLocalPlace place) {
        if (place.getAddressText() != null && !place.getAddressText().isBlank()) {
            return place.getAddressText().trim();
        }
        try {
            String city = propertyModule.getActiveProperty(place.getPropertyId()).city();
            return city == null || city.isBlank()
                    ? place.getName()
                    : place.getName() + ", " + city.trim();
        } catch (RuntimeException propertyGone) {
            return place.getName();
        }
    }
}
