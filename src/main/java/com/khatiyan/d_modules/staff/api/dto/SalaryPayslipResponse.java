package com.khatiyan.d_modules.staff.api.dto;

import java.time.Instant;
import java.time.LocalDate;

import com.khatiyan.d_modules.staff.model.SalaryPayment;
import com.khatiyan.d_modules.staff.model.SalaryPaymentMethod;

/**
 * One salary payment, with enough context to stand on its own.
 *
 * <p>{@link SalaryPaymentResponse} is nested inside a month inside an account,
 * so the reader already knows who and when. A payslip is read as a flat list —
 * either an employee's own history or a whole property's — so it has to carry
 * the payroll month and the holder's name itself.
 */
public record SalaryPayslipResponse(
        String id,
        String salaryAccountReferenceCode,
        String holderName,
        LocalDate payrollMonth,
        long amountPaise,
        LocalDate paidOn,
        Instant recordedAt,
        SalaryPaymentMethod paymentMethod,
        String referenceText,
        String notes) {

    public static SalaryPayslipResponse from(
            SalaryPayment payment,
            String salaryAccountReferenceCode,
            String holderName,
            LocalDate payrollMonth) {
        return new SalaryPayslipResponse(
                payment.getId().toString(),
                salaryAccountReferenceCode,
                holderName,
                payrollMonth,
                payment.getAmountPaise(),
                payment.getPaidOn(),
                payment.getCreatedAt(),
                payment.getPaymentMethod(),
                payment.getReferenceText(),
                payment.getNotes());
    }
}
