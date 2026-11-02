package com.khatiyan.d_modules.discovery.metro;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.discovery.api.dto.MetroSystemResponse;
import com.khatiyan.d_modules.discovery.repository.PropertyDiscoveryProfileRepository;

@Service
public class MetroService {

    /** A property counts as near a ticked station within this, in a straight line (user, 2026-10-31). */
    static final double RADIUS_KM = 5.0d;
    private static final int MAX_TICKED_STATIONS = 60;

    private final MetroRepository metroRepository;
    private final PropertyDiscoveryProfileRepository discoveryProfileRepository;

    public MetroService(MetroRepository metroRepository, PropertyDiscoveryProfileRepository discoveryProfileRepository) {
        this.metroRepository = metroRepository;
        this.discoveryProfileRepository = discoveryProfileRepository;
    }

    /**
     * The station tree: system, its lines, each line's stations in order. An
     * interchange is one station under each of its lines, carrying the colours
     * of the others.
     */
    @Transactional(readOnly = true)
    public List<MetroSystemResponse> systems() {
        List<MetroRepository.LineStationRow> rows = metroRepository.lineStations();
        List<MetroRepository.LineRow> lines = metroRepository.lines();
        Map<String, String> colourByLine = lines.stream()
                .collect(Collectors.toMap(MetroRepository.LineRow::code, MetroRepository.LineRow::colour));
        Map<String, List<String>> linesByStation = new HashMap<>();
        Map<String, List<MetroRepository.LineStationRow>> rowsByLine = new HashMap<>();
        for (MetroRepository.LineStationRow row : rows) {
            linesByStation.computeIfAbsent(row.stationCode(), code -> new ArrayList<>()).add(row.lineCode());
            rowsByLine.computeIfAbsent(row.lineCode(), code -> new ArrayList<>()).add(row);
        }

        Map<String, List<MetroSystemResponse.LineResponse>> linesBySystem = new HashMap<>();
        for (MetroRepository.LineRow line : lines) {
            List<MetroRepository.LineStationRow> onLine = rowsByLine.getOrDefault(line.code(), List.of());
            if (onLine.isEmpty()) {
                continue;
            }
            List<MetroSystemResponse.StationResponse> stations = onLine.stream()
                    .map(row -> new MetroSystemResponse.StationResponse(
                            row.stationCode(),
                            row.stationName(),
                            linesByStation.get(row.stationCode()).stream()
                                    .filter(other -> !other.equals(line.code()))
                                    .map(colourByLine::get)
                                    .toList()))
                    .toList();
            linesBySystem.computeIfAbsent(line.systemCode(), code -> new ArrayList<>())
                    .add(new MetroSystemResponse.LineResponse(
                            line.code(),
                            line.name(),
                            line.colour(),
                            onLine.getFirst().stationName(),
                            onLine.getLast().stationName(),
                            stations));
        }

        return metroRepository.systems().stream()
                .map(system -> new MetroSystemResponse(
                        system.code(),
                        system.name(),
                        system.centreLatitude(),
                        system.centreLongitude(),
                        linesBySystem.getOrDefault(system.code(), List.of())))
                .toList();
    }

    /**
     * Visible properties near any of these stations, each with the nearest of
     * them. One read for the stations and one for the properties in the box they
     * make, however many are ticked. The box is only a prefilter: a whole line
     * makes a wide one, and {@link MetroProximity} decides what is truly near.
     */
    @Transactional(readOnly = true)
    public Map<UUID, MetroProximity.Nearest> nearestTicked(Collection<String> stationCodes) {
        Set<String> codes = new LinkedHashSet<>(stationCodes);
        if (codes.size() > MAX_TICKED_STATIONS) {
            throw new ValidationException("Choose at most " + MAX_TICKED_STATIONS + " stations");
        }
        List<MetroProximity.StationPoint> stations = metroRepository.stationPoints(codes);
        if (stations.isEmpty()) {
            return Map.of();
        }

        double minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        double latDelta = RADIUS_KM / 111.045d;
        for (MetroProximity.StationPoint station : stations) {
            double lngDelta = RADIUS_KM / (111.320d * Math.max(0.09d, Math.cos(Math.toRadians(station.latitude()))));
            minLat = Math.min(minLat, station.latitude() - latDelta);
            maxLat = Math.max(maxLat, station.latitude() + latDelta);
            minLng = Math.min(minLng, station.longitude() - lngDelta);
            maxLng = Math.max(maxLng, station.longitude() + lngDelta);
        }
        List<MetroProximity.PropertyPoint> properties = discoveryProfileRepository
                .findVisiblePropertyPoints(minLat, maxLat, minLng, maxLng).stream()
                .map(point -> new MetroProximity.PropertyPoint(point.getPropertyId(), point.getLatitude(), point.getLongitude()))
                .toList();
        return MetroProximity.nearest(properties, stations, RADIUS_KM);
    }
}
