package com.khatiyan.d_modules.staff.api.dto;

import java.time.LocalDate;

import com.khatiyan.c_shared.employment.SalaryStructure;
import com.khatiyan.d_modules.staff.model.SalaryAccount;

public record SalaryAccountResponse(
        String referenceCode,
        SalaryHolderType holderType,
        String holderReferenceCode,
        String holderName,
        String categoryName,
        SalaryStructure salaryStructure,
        long salaryRatePaise,
        boolean active,
        LocalDate openedOn,
        LocalDate settledOn,
        long grossPayToDatePaise,
        long netPayToDatePaise,
        long paidToDatePaise) {

    public static SalaryAccountResponse from(
            SalaryAccount account,
            SalaryHolderType holderType,
            String holderReferenceCode,
            String holderName,
            String categoryName,
            SalaryStructure salaryStructure,
            long salaryRatePaise,
            long grossPayToDatePaise,
            long netPayToDatePaise,
            long paidToDatePaise) {
        return new SalaryAccountResponse(
                account.getReferenceCode(),
                holderType,
                holderReferenceCode,
                holderName,
                categoryName,
                salaryStructure,
                salaryRatePaise,
                account.isActive(),
                account.getOpenedOn(),
                account.getSettledOn(),
                grossPayToDatePaise,
                netPayToDatePaise,
                paidToDatePaise);
    }
}
