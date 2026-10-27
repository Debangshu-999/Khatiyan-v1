package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;
import java.util.UUID;

/** Internal module DTO; no departing tenant identity/details. */
public record BookingBedHoldResponse(UUID holdId, UUID bookingId, UUID propertyId, UUID roomId,
        LocalDate moveInDate, UUID exitRequestId, String state) {}
