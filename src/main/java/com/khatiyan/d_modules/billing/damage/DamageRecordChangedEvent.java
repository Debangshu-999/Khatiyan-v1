package com.khatiyan.d_modules.billing.damage;

import java.util.List;
import java.util.UUID;

/**
 * A damage record was made, changed or deleted, for each tenant it names
 * (2026-10-29). It carries everything the notice says, so a deleted record
 * can still be described.
 */
public record DamageRecordChangedEvent(
        UUID recordId,
        String code,
        UUID propertyId,
        String itemName,
        String damageLevel,
        Kind kind,
        List<Recipient> recipients) {

    public enum Kind { CREATED, UPDATED, DELETED }

    /** A tenant named on the record, and what of it is theirs. */
    public record Recipient(UUID tenantUserId, UUID tenancyId, long amountPaise) {
    }
}
