package com.khatiyan.d_modules.tenancy.api.dto;

/**
 * The roll call settings as saved (user, 2026-11-15). The window's ends are minutes
 * of the day; either may be null until the owner picks it.
 *
 * @param version the settings' version the screen loaded, refused when stale
 */
public record SaveRollCallSettingsRequest(
        boolean enabled,
        boolean autoCheckIn,
        Integer windowStartMinute,
        Integer windowEndMinute,
        Long version) {
}
