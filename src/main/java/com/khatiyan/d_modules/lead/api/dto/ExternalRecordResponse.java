package com.khatiyan.d_modules.lead.api.dto;

import java.util.UUID;

/**
 * What recording an external visit or booking made (2026-10-19): the lead it
 * joined or opened, and the visit or the booking.
 */
public record ExternalRecordResponse(
        UUID leadId,
        String leadReferenceCode,
        String leadStage,
        String leadState,
        UUID visitId,
        String visitReferenceCode,
        UUID bookingId) {
}
