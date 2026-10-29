package com.khatiyan.d_modules.tenancy.api.dto;

import java.util.List;

import com.khatiyan.d_modules.property.model.DamageLevel;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * The move-in checklist as filled in at onboarding (2026-10-29): every item
 * with a damage level and 1 to 3 photos of it, and the keys handed over.
 * Optional on every onboarding: absent, nothing is recorded.
 */
public record MoveInChecklistInput(
        @NotEmpty(message = "Add at least one item to the move-in checklist")
        @Size(max = 60, message = "A move-in checklist can have at most 60 items")
        List<@Valid @NotNull ItemInput> items,

        @NotNull(message = "Enter how many keys were handed over")
        @Min(value = 1, message = "At least 1 key is handed over")
        @Max(value = 50, message = "Keys handed over must be 50 or fewer")
        Integer keysHandedOver) {

    public record ItemInput(
            @NotBlank(message = "Every checklist item needs a name")
            @Size(max = 80, message = "Keep each item's name under 80 characters")
            String name,

            @NotNull(message = "Pick a damage level for every item")
            DamageLevel damageLevel,

            @Size(max = 200, message = "Keep each item's note under 200 characters")
            String note,

            boolean custom,

            /** 1 to 3 photos of this item, required (2026-10-29). */
            @NotEmpty(message = "Add at least one photo of every item")
            @Size(max = 3, message = "Add at most 3 photos of each item")
            List<@NotBlank @Size(max = 600) String> photoUrls,

            /** Room, Amenities or Bathroom. Null is Room. */
            com.khatiyan.d_modules.tenancy.model.MoveInSection section) {
    }
}
