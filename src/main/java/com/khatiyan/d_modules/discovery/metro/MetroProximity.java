package com.khatiyan.d_modules.discovery.metro;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Which ticked station each property is nearest to. Only the stations passed in
 * are ever measured from, so a closer station nobody ticked cannot be named.
 */
public final class MetroProximity {

    private static final double EARTH_RADIUS_KM = 6371.0088d;

    public record PropertyPoint(UUID propertyId, double latitude, double longitude) {
    }

    public record StationPoint(String name, double latitude, double longitude) {
    }

    public record Nearest(String stationName, double distanceKm) {
    }

    private MetroProximity() {
    }

    /** Properties within the radius of at least one station, each with its nearest. */
    public static Map<UUID, Nearest> nearest(List<PropertyPoint> properties, List<StationPoint> stations, double radiusKm) {
        Map<UUID, Nearest> found = new HashMap<>();
        for (PropertyPoint property : properties) {
            Nearest best = null;
            for (StationPoint station : stations) {
                double km = distanceKm(property.latitude(), property.longitude(), station.latitude(), station.longitude());
                if (km <= radiusKm && (best == null || km < best.distanceKm())) {
                    best = new Nearest(station.name(), km);
                }
            }
            if (best != null) {
                found.put(property.propertyId(), best);
            }
        }
        return found;
    }

    private static double distanceKm(double fromLat, double fromLng, double toLat, double toLng) {
        double fromPhi = Math.toRadians(fromLat);
        double toPhi = Math.toRadians(toLat);
        double cosine = Math.cos(fromPhi) * Math.cos(toPhi) * Math.cos(Math.toRadians(toLng - fromLng))
                + Math.sin(fromPhi) * Math.sin(toPhi);
        return EARTH_RADIUS_KM * Math.acos(Math.min(1d, Math.max(-1d, cosine)));
    }
}
