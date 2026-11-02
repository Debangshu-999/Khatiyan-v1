package com.khatiyan.d_modules.billing.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.billing.damage.DamageRecordSource;
import com.khatiyan.d_modules.billing.damage.DamageRecordStatus;
import com.khatiyan.d_modules.billing.damage.DamageResponsibility;
import com.khatiyan.d_modules.property.model.DamageLevel;

/**
 * A damage record as management and its tenants read it (2026-10-29).
 * {@code splitNumber}: which split of the damage this is, null if not split.
 * {@code charged}: every share is resolved, by a bill, the deposit or a waiver.
 * {@code locked}: a bill from it is paid or awaiting confirmation, or a share
 * was waived or took money from the deposit, so it can no longer change.
 */
public record DamageRecordResponse(
        UUID id,
        String code,
        UUID roomId,
        String roomLabel,
        String itemName,
        String section,
        DamageLevel damageLevel,
        long costPaise,
        String note,
        List<String> photoUrls,
        DamageResponsibility responsibility,
        DamageRecordSource source,
        DamageRecordStatus status,
        Instant createdAt,
        UUID createdByUserId,
        String createdByName,
        List<Share> shares,
        boolean charged,
        boolean locked,
        Integer splitNumber,
        DamageLevel repairedLevel,
        List<String> repairPhotoUrls,
        String repairNote,
        Instant repairedAt,
        UUID repairedByUserId,
        String repairedByName,
        long version) {

    public record Share(UUID tenancyId, String tenantName, long amountPaise, UUID billId, String billCode, String billStatus,
            boolean waived, long depositPaise) {
    }
}
