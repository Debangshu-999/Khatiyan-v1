package com.khatiyan.d_modules.staff.api.dto;

import java.time.LocalDate;
import java.util.List;

import com.khatiyan.c_shared.employment.SalaryStructure;
import com.khatiyan.d_modules.staff.model.SalaryMonth;
import com.khatiyan.d_modules.staff.model.SalaryPaymentStatus;

public record SalaryMonthResponse(
        LocalDate payrollMonth,
        LocalDate openedOn,
        SalaryStructure salaryStructure,
        long salaryRatePaise,
        Integer payableDays,
        long baseAmountPaise,
        long additionsAmountPaise,
        long deductionsAmountPaise,
        long grossAmountPaise,
        long netAmountPaise,
        long paidAmountPaise,
        SalaryPaymentStatus paymentStatus,
        List<SalaryAdjustmentResponse> adjustments,
        List<SalaryPaymentResponse> payments) {

    public static SalaryMonthResponse from(
            SalaryMonth month,
            List<SalaryAdjustmentResponse> adjustments,
            List<SalaryPaymentResponse> payments) {
        return new SalaryMonthResponse(
                month.getPayrollMonth(),
                month.getOpenedOn(),
                month.getSalaryStructure(),
                month.getSalaryRatePaise(),
                month.getPayableDays(),
                month.getBaseAmountPaise(),
                month.getAdditionsAmountPaise(),
                month.getDeductionsAmountPaise(),
                month.getGrossAmountPaise(),
                month.getNetAmountPaise(),
                month.getPaidAmountPaise(),
                month.getPaymentStatus(),
                adjustments,
                payments);
    }
}
