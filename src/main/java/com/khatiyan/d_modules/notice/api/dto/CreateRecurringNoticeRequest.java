package com.khatiyan.d_modules.notice.api.dto;

import java.time.LocalDate;
import java.time.LocalTime;

import com.khatiyan.d_modules.notice.model.RecurringNoticeFrequency;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record CreateRecurringNoticeRequest(

    @NotNull
    @Valid
    CreateNoticeRequest notice,

    @NotNull
    RecurringNoticeFrequency frequency,

    @NotNull
    LocalTime startTime,

    @NotNull
    LocalTime endTime,

    LocalDate activeFrom,

    LocalDate activeUntil
) {
}
