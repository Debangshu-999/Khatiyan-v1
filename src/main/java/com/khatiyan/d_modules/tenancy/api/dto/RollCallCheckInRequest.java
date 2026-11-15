package com.khatiyan.d_modules.tenancy.api.dto;

import java.math.BigDecimal;

/**
 * What the app saw when the tenant opened it (user, 2026-11-09): the router it is
 * connected to, and failing that where it is. Any part may be missing. The server
 * decides whether it matches the property.
 *
 * @param mocked Android's own flag for a position from a fake-location app
 */
public record RollCallCheckInRequest(
        String bssid,
        BigDecimal latitude,
        BigDecimal longitude,
        Double accuracyMeters,
        Boolean mocked) {
}
