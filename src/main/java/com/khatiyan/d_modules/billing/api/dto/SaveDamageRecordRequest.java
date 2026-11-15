package com.khatiyan.d_modules.billing.api.dto;

import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.billing.damage.DamageResponsibility;
import com.khatiyan.d_modules.property.model.DamageLevel;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * A damage as management records or edits it (2026-10-29). {@code tenancyId}
 * names the one tenant for TENANT and is null for SPLIT, which makes a record per
 * tenant in the room with the cost shared equally. {@code chargeNow} bills every
 * record this makes in the same step, so a split is charged whole or not at all.
 */
public record SaveDamageRecordRequest(
        @NotNull(message = "Pick the room") UUID roomId,
        @NotBlank(message = "Pick the item") @Size(max = 80) String itemName,
        String section,
        /** Required while the property grades damage by level, ignored when it does not (2026-11-07). */
        DamageLevel damageLevel,
        @Min(value = 1, message = "Enter the cost") long costPaise,
        @Size(max = 300) String note,
        @NotEmpty(message = "Add at least one photo of the damage") @Size(max = 3, message = "Add at most 3 photos") List<String> photoUrls,
        @NotNull(message = "Pick who is responsible") DamageResponsibility responsibility,
        UUID tenancyId,
        Boolean chargeNow) {

    public SaveDamageRecordRequest(UUID roomId, String itemName, String section, DamageLevel damageLevel, long costPaise,
            String note, List<String> photoUrls, DamageResponsibility responsibility, UUID tenancyId) {
        this(roomId, itemName, section, damageLevel, costPaise, note, photoUrls, responsibility, tenancyId, null);
    }
}
