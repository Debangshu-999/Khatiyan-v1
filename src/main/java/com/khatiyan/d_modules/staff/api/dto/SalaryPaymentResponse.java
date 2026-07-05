package com.khatiyan.d_modules.staff.api.dto;

import java.time.Instant;
import java.time.LocalDate;

import com.khatiyan.d_modules.staff.model.SalaryPayment;
import com.khatiyan.d_modules.staff.model.SalaryPaymentMethod;

public record SalaryPaymentResponse(
        String id,
        long amountPaise,
        LocalDate paidOn,
        Instant recordedAt,
        SalaryPaymentMethod paymentMethod,
        String referenceText,
        String notes) {

    public static SalaryPaymentResponse from(SalaryPayment payment) {
        return new SalaryPaymentResponse(
                payment.getId().toString(),
                payment.getAmountPaise(),
                payment.getPaidOn(),
                payment.getCreatedAt(),
                payment.getPaymentMethod(),
                payment.getReferenceText(),
                payment.getNotes());
    }
}
