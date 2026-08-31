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
        Set<DeductionCategory> permittedDeductions) {

    public record DamageChargeInput(
            @NotBlank @Size(max = 80) String name,
            @NotNull @PositiveOrZero Long chargePaise) {
    }
}
