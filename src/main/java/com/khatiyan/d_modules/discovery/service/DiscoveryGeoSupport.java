package com.khatiyan.d_modules.discovery.service;

import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

final class DiscoveryGeoSupport {

    private static final double EARTH_RADIUS_KM = 6371.0;

    private DiscoveryGeoSupport() {
    }

    static Double distanceKm(
            BigDecimal fromLatitude,
            BigDecimal fromLongitude,
            BigDecimal toLatitude,
            BigDecimal toLongitude) {
        if (fromLatitude == null || fromLongitude == null || toLatitude == null || toLongitude == null) {
            return null;
        }

        double latitudeDistance = Math.toRadians(toLatitude.doubleValue() - fromLatitude.doubleValue());
        double longitudeDistance = Math.toRadians(toLongitude.doubleValue() - fromLongitude.doubleValue());

        double fromLatitudeRadians = Math.toRadians(fromLatitude.doubleValue());
        double toLatitudeRadians = Math.toRadians(toLatitude.doubleValue());

        double haversine = Math.sin(latitudeDistance / 2) * Math.sin(latitudeDistance / 2)
                + Math.cos(fromLatitudeRadians)
                * Math.cos(toLatitudeRadians)
                * Math.sin(longitudeDistance / 2)
                * Math.sin(longitudeDistance / 2);

        double angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
        return EARTH_RADIUS_KM * angularDistance;
    }

    static String directionsUrl(BigDecimal latitude, BigDecimal longitude, String fallbackUrl) {
        if (latitude != null && longitude != null) {
            return "https://www.google.com/maps/dir/?api=1&destination="
                    + latitude.toPlainString()
                    + ","
                    + longitude.toPlainString();
        }

        return fallbackUrl;
    }

    static String propertyDirectionsUrl(
            BigDecimal latitude,
            BigDecimal longitude,
            String address,
            String city,
            String pincode) {
        String coordinateUrl = directionsUrl(latitude, longitude, null);
        if (coordinateUrl != null) {
            return coordinateUrl;
        }

        StringBuilder query = new StringBuilder();
        appendQueryPart(query, address);
        appendQueryPart(query, city);
        appendQueryPart(query, pincode);

        if (query.isEmpty()) {
            return null;
        }

        return "https://www.google.com/maps/dir/?api=1&destination="
                + URLEncoder.encode(query.toString(), StandardCharsets.UTF_8);
    }

    private static void appendQueryPart(StringBuilder query, String value) {
        if (value == null || value.isBlank()) {
            return;
        }

        if (!query.isEmpty()) {
            query.append(", ");
        }

        query.append(value.trim());
    }
}
