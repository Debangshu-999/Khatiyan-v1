package com.khatiyan.d_modules.billing.api.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Owner request to settle a deposit at exit: the property damage-charge items
 * assessed as damaged (their charges are totalled into one deduction, priced
 * from the property's authoritative schedule), plus any custom charges, then the
 * remaining balance is refunded and the account closed.
 */
public record SettleDepositWithDamagesRequest(
        List<String> damageItemNames,
        @Valid List<CustomChargeInput> customCharges,
        @Size(max = 200) String reason) {

    public record CustomChargeInput(
            @NotBlank @Size(max = 120) String reason,
            @NotNull @Positive Long amountPaise) {
    }
}
