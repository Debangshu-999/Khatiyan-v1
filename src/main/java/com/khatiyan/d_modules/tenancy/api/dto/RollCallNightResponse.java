package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.RollCallMethod;

/**
 * One night's roll call for the warden (user, 2026-11-15): who is on the roll,
 * their state and how it was reached, Not marked first.
 */
public record RollCallNightResponse(
        LocalDate night,
        LocalDate tonight,
        boolean enabled,
        Integer windowStartMinute,
        Integer windowEndMinute,
        Counts counts,
        List<Entry> entries) {

    public record Counts(int present, int presentVerified, int presentSelf, int away, int notMarked, int absent) {
    }

    /** {@code state} is PRESENT, ABSENT, AWAY, AWAY_DECLARED or NOT_MARKED. */
    public record Entry(
            UUID tenancyId,
            String tenancyCode,
            String tenantName,
            String roomNumber,
            String state,
            RollCallMethod method,
            Instant markedAt,
            /** Who made a warden's mark (user, 2026-11-15): shown by name, or as "You". Null otherwise. */
            UUID markedByUserId,
            String markedByName) {
    }
}
