package com.khatiyan.d_modules.lead.api.dto;

import java.time.LocalTime;

import com.khatiyan.d_modules.lead.model.VisitImpression;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * The visit form: when they left, how many came, what they made of the
 * property. Each may be left out (user, 2026-10-04). A time they left that is
 * never given becomes the end of their slot once the day is over.
 */
public record VisitFormRequest(
        LocalTime departedAt,
        @Min(1) @Max(20) Integer partySize,
        VisitImpression impression) {
}
