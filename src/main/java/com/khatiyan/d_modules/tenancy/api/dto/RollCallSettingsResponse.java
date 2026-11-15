package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** A property's roll call settings and its registered WiFi (user, 2026-11-15). */
public record RollCallSettingsResponse(
        boolean enabled,
        boolean autoCheckIn,
        Integer windowStartMinute,
        Integer windowEndMinute,
        int radiusMeters,
        List<Wifi> wifi,
        long version) {

    public record Wifi(UUID id, String bssid, String ssid, Instant addedAt) {
    }
}
