package com.khatiyan.d_modules.staff.api.dto;

import java.time.LocalDate;

import com.khatiyan.d_modules.staff.model.SalaryPaymentMethod;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Ends an employment with a full-and-final settlement. The salary fields apply
 * only when the worker has an open salary account; {@code additionalAmountPaise}
 * is a final extra paid on top of clearing any unpaid months.
 */
public record EndEmploymentRequest(
    @NotBlank @Size(max = 500) String reason,
    @Size(max = 2000) String review,
    @PositiveOrZero long additionalAmountPaise,
    SalaryPaymentMethod paymentMethod,
    LocalDate paidOn,
    @Size(max = 500) String settlementNotes
) {
}
