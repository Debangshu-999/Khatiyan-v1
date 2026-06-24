package com.khatiyan.d_modules.staff.api.dto;

import com.khatiyan.d_modules.staff.model.SalaryAdjustmentType;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record UpdateSalaryAdjustmentRequest(
        @NotNull SalaryAdjustmentType adjustmentType,
        @Positive long amountPaise,
        @NotBlank @Size(max = 500) String reason) {
}
