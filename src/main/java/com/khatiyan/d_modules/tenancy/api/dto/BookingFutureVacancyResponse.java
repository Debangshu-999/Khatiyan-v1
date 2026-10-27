package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;
import java.util.UUID;

/** Opaque selectable exit source, never the occupant's name, phone or tenancy details. */
public record BookingFutureVacancyResponse(UUID roomId, UUID exitRequestId, LocalDate checkoutDate,
        LocalDate earliestMoveInDate, LocalDate latestMoveInDate) {}
