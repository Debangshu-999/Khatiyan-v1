package com.khatiyan.d_modules.staff.api.dto;

import java.time.LocalDate;

import com.khatiyan.d_modules.staff.model.SalaryPaymentMethod;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record RecordSalaryPaymentRequest(
        @Positive long amountPaise,
        @NotNull LocalDate paidOn,
        @NotNull SalaryPaymentMethod paymentMethod,
        @Size(max = 120) String referenceText,
        @Size(max = 500) String notes) {
}
