package com.khatiyan.d_modules.lead.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

/**
 * The visitor's pass for their slot (user, 2026-10-04): what the QR holds, and
 * the code read out when it cannot be scanned.
 *
 * @param validUntil midnight at the end of the visit's day
 */
public record VisitPassResponse(
        UUID visitId,
        String referenceCode,
        String propertyName,
        LocalDate date,
        LocalTime slotStart,
        LocalTime slotEnd,
        String token,
        String code,
        Instant validUntil) {
}
