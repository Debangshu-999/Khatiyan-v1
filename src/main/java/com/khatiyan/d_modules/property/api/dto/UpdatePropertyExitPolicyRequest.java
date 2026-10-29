package com.khatiyan.d_modules.property.api.dto;

import java.util.List;
import java.util.Set;

import com.khatiyan.d_modules.property.model.DeductionCategory;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Owner request to replace a property's exit policies. Null lists clear that
 * policy; empty lists are allowed (e.g. no damage schedule).
 *
 * <p>The premature-exit policy is deliberately NOT here. It moved to the
 * agreement screen, beside the term it qualifies, and has its own endpoint —
 * because this request replaces everything it carries, so a screen holding only
 * that one field would clear the schedule and the checklist along with it.
 */
public record UpdatePropertyExitPolicyRequest(
        @Valid List<DamageChargeInput> damageCharges,
        List<@NotBlank @Size(max = 120) String> exitChecklist,

        /**
         * What the deposit may be used for.
         *
         * <p>Null CLEARS, like every other list here — a client that omits the
         * field cannot silently keep a policy the owner meant to empty.
         */
        Set<DeductionCategory> permittedDeductions,

        /** What D1, D2 and D3 mean. Null keeps the current wording (2026-10-29). */
        @Valid DamageLevelDescriptions damageLevels) {

    /**
     * An item and its price at each damage level. A client that still sends
     * one flat {@code chargePaise} gets it at every level.
     */
    public record DamageChargeInput(
            @NotBlank @Size(max = 80) String name,
            @PositiveOrZero Long chargePaise,
            @PositiveOrZero Long d1Paise,
            @PositiveOrZero Long d2Paise,
            @PositiveOrZero Long d3Paise,
            /** Room, Amenities or Bathroom. Null is Room. */
            com.khatiyan.d_modules.property.model.DamageCategory category) {

        public DamageChargeInput(String name, Long chargePaise) {
            this(name, chargePaise, null, null, null, null);
        }

        /** No level sent but one flat amount: the old flat charge, at every level. */
        private boolean flat() {
            return chargePaise != null && d1Paise == null && d2Paise == null && d3Paise == null;
        }

        /** Null when the item is not priced yet. */
        public Long d1() {
            return flat() ? chargePaise : d1Paise;
        }

        /** Null when the item has no D2. */
        public Long d2() {
            return flat() ? chargePaise : d2Paise;
        }

        /** Null when the item has no D3. */
        public Long d3() {
            return flat() ? chargePaise : d3Paise;
        }
    }

    public record DamageLevelDescriptions(
            @Size(max = 120) String d1,
            @Size(max = 120) String d2,
            @Size(max = 120) String d3) {
    }
}
