package com.khatiyan.d_modules.property.api.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Owner request to replace a property's exit policies. Null lists clear that
 * policy; empty lists are allowed (e.g. no damage schedule).
 */
public record UpdatePropertyExitPolicyRequest(
        @Valid List<DamageChargeInput> damageCharges,
        List<@NotBlank @Size(max = 120) String> exitChecklist,
        /**
         * What leaving before serving notice costs, in the owner's words.
         *
         * <p>Free text, never a formula: the computed penalty this replaced was
         * a number nobody had agreed to, and every property prices an early
         * departure differently. Applied by a person at end-tenancy.
         */
        @Size(max = 2000) String prematureExitPolicy) {

    public record DamageChargeInput(
            @NotBlank @Size(max = 80) String name,
            @NotNull @PositiveOrZero Long chargePaise) {
    }
}
