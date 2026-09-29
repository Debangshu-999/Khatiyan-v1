package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.service.FutureVacancies;

/**
 * A bed in a full room that a new monthly stay can be booked into ahead: it
 * frees on {@code availableFrom}, through a room change or a stay ending.
 */
public record UpcomingVacancyResponse(
    UUID roomId,
    LocalDate availableFrom,
    FutureVacancies.Source source
) {
    public static UpcomingVacancyResponse from(FutureVacancies.UpcomingVacancy vacancy) {
        return new UpcomingVacancyResponse(vacancy.roomId(), vacancy.availableFrom(), vacancy.source());
    }
}
