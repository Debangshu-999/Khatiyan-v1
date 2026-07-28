package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record CreateTenancyRequest(
    @NotBlank @Size(max = 15) String tenantPhone,
    @Size(max = 120) String tenantName,
    @NotNull UUID propertyId,
    @NotNull UUID roomId,
    TenancyBillingType billingType,
    @PositiveOrZero Long rentAmountPaise,
    @PositiveOrZero Long depositAmountPaise,
    @NotNull LocalDate startDate,
    LocalDate plannedEndDate,

    /**
     * The owner confirming they collected and checked the tenant's ID proof and
     * photograph. {@code @AssertTrue} rather than {@code @NotNull}: an
     * unchecked box must fail, not merely be absent.
     */
    @AssertTrue(message = "Confirm you have checked the tenant's ID proof and photograph before onboarding")
    boolean idCheckConfirmed
) {
    public TenancyBillingType resolvedBillingType() {
        if (billingType == null) {
            return TenancyBillingType.MONTHLY;
        }

        return billingType;
    }
}

