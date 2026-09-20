package com.khatiyan.d_modules.servicebalance.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceEntry;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceEntryType;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceReferenceType;

/**
 * One line of the owner's statement.
 *
 * <p>All THREE deltas travel, not one net figure: a hold and a charge look
 * identical in a single number, and "we are holding this" versus "this is gone"
 * is exactly what an owner reading a statement is trying to tell apart.
 *
 * <p>Outstanding is the third because a charge that could not be covered moves
 * neither of the other two — it lands on the tab. Sending only available and
 * reserved made that line arrive as a row of zeroes, which the statement can
 * only render as a charge of nothing.
 */
public record ServiceBalanceEntryResponse(
        UUID id,
        ServiceBalanceEntryType type,
        long availableDeltaPaise,
        long reservedDeltaPaise,
        long outstandingDeltaPaise,
        long availableAfterPaise,
        long reservedAfterPaise,
        long outstandingAfterPaise,
        ServiceBalanceReferenceType referenceType,
        UUID referenceId,
        String memo,
        Instant createdAt) {

    public static ServiceBalanceEntryResponse from(ServiceBalanceEntry entry) {
        return new ServiceBalanceEntryResponse(
                entry.getId(),
                entry.getEntryType(),
                entry.getAvailableDeltaPaise(),
                entry.getReservedDeltaPaise(),
                entry.getOutstandingDeltaPaise(),
                entry.getAvailableAfterPaise(),
                entry.getReservedAfterPaise(),
                entry.getOutstandingAfterPaise(),
                entry.getReferenceType(),
                entry.getReferenceId(),
                entry.getMemo(),
                entry.getCreatedAt());
    }
}
