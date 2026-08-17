package com.khatiyan.d_modules.notice.api.dto;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;

import com.khatiyan.d_modules.notice.model.RecurringNoticeFrequency;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record UpdateRecurringNoticeRequest(

    @NotNull
    @Valid
    CreateNoticeRequest notice,

    @NotNull
    RecurringNoticeFrequency frequency,

    /** Required for WEEKLY, ignored otherwise. */
    Set<DayOfWeek> daysOfWeek,

    /** Required for MONTHLY, ignored otherwise. Days 1-31. */
    Set<@Min(1) @Max(31) Integer> daysOfMonth,

    @NotNull
    LocalTime startTime,

    @NotNull
    LocalTime endTime,

    LocalDate activeFrom,

    LocalDate activeUntil
) {
}
