package com.khatiyan.d_modules.billing.api.dto;

import java.util.List;

import com.khatiyan.d_modules.property.model.DamageLevel;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

/** A repair (the level it is back to) or a replacement (always NA), with photos of it. */
public record RepairDamageRecordRequest(
        DamageLevel level,
        @NotEmpty(message = "Add at least one photo of the fix") @Size(max = 3, message = "Add at most 3 photos") List<String> photoUrls,
        @Size(max = 300) String note) {
}
