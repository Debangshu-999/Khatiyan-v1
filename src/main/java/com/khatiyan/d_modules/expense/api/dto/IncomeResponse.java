package com.khatiyan.d_modules.expense.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.expense.model.IncomeEntry;
import com.khatiyan.d_modules.expense.model.IncomeEntryType;

public record IncomeResponse(
        UUID id,
        String source,
        String receivedFrom,
        long amountPaise,
        LocalDate receivedDate,
        IncomeEntryType entryType,
        String description,
        UUID reversesIncomeId,
        boolean reversed,
        Instant createdAt) {

    public static IncomeResponse from(IncomeEntry income, boolean reversed) {
        return new IncomeResponse(
                income.getId(),
                income.getSource(),
                income.getReceivedFrom(),
                income.getAmountPaise(),
                income.getReceivedDate(),
                income.getEntryType(),
                income.getDescription(),
                income.getReversesIncomeId(),
                reversed,
                income.getCreatedAt());
    }
}
