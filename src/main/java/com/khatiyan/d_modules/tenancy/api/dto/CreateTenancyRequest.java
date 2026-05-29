package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record CreateTenancyRequest(
    @NotBlank @Size(max = 15) String tenantPhone,
    @NotNull UUID propertyId,
    @NotNull UUID roomId,
    TenancyBillingType billingType,
    @PositiveOrZero Long depositAmountPaise,
    @NotNull LocalDate startDate,
    LocalDate plannedEndDate
) {
    public TenancyBillingType resolvedBillingType() {
        if (billingType == null) {
            return TenancyBillingType.MONTHLY;
        }

        return billingType;
    }
}

