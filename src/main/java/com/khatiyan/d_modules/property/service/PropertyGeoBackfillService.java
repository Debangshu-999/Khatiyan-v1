package com.khatiyan.d_modules.property.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.geo.GeoModule;
import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.property.model.Property;
import com.khatiyan.d_modules.property.repository.PropertyRepository;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import lombok.extern.slf4j.Slf4j;

/**
 * Nightly convergence job: forward-geocodes active properties that still lack
 * coordinates (registered before the map picker, or saved without pinning) so
 * geo discovery eventually covers every listing. Small batch per run to protect
 * the vendor quota; never overwrites an owner-pinned point.
 */
@Slf4j
@Component
public class PropertyGeoBackfillService {

    private final PropertyRepository propertyRepository;
    private final GeoModule geoModule;
    private final int batchSize;

    public PropertyGeoBackfillService(
            PropertyRepository propertyRepository,
            GeoModule geoModule,
            @Value("${app.geo.backfill.batch-size:20}") int batchSize) {
        this.propertyRepository = propertyRepository;
        this.geoModule = geoModule;
        this.batchSize = batchSize;
    }

    @Scheduled(
            cron = "${app.geo.backfill.property-cron:0 5 1 * * *}",
            zone = "${app.geo.backfill.zone:Asia/Kolkata}")
    @SchedulerLock(name = "geo-backfillPropertyCoordinates", lockAtMostFor = "PT15M", lockAtLeastFor = "PT15S")
    @Transactional
    public void backfillPropertyCoordinates() {
        if (!geoModule.isLiveProvider()) {
            log.info("Property geo backfill skipped: no live geocoding provider configured");
            return;
        }

        List<Property> candidates = propertyRepository.findByActiveTrueAndLatitudeIsNull();
        if (candidates.isEmpty()) {
            return;
        }

        int attempted = 0;
        int filled = 0;
        for (Property property : candidates) {
            if (attempted >= batchSize) {
                break;
            }
            attempted++;

            String query = addressQuery(property);
            if (query.length() < 2) {
                continue;
            }
            GeoSuggestionResponse best = geoModule.systemSearch(query).stream()
                    .filter(suggestion -> suggestion.latitude() != null && suggestion.longitude() != null)
                    .findFirst()
                    .orElse(null);
            if (best == null) {
                log.info("Property geo backfill found no match propertyId={} query='{}'", property.getId(), query);
                continue;
            }
            property.backfillCoordinates(
                    BigDecimal.valueOf(best.latitude()),
                    BigDecimal.valueOf(best.longitude()));
            filled++;
        }

        log.info(
                "Property geo backfill completed pending={} attempted={} filled={}",
                candidates.size(),
                attempted,
                filled);
    }

    private static String addressQuery(Property property) {
        return String.join(", ", Stream.of(
                        property.getAddress(),
                        property.getArea(),
                        property.getCity(),
                        property.getState(),
                        property.getPincode())
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(part -> !part.isEmpty())
                .toList());
    }
}
