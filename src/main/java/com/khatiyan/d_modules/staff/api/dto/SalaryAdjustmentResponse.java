package com.khatiyan.d_modules.staff.api.dto;

import com.khatiyan.d_modules.staff.model.SalaryAdjustment;
import com.khatiyan.d_modules.staff.model.SalaryAdjustmentType;

public record SalaryAdjustmentResponse(
        String id,
        SalaryAdjustmentType adjustmentType,
        long amountPaise,
        String reason,
        String createdAt) {

    public static SalaryAdjustmentResponse from(SalaryAdjustment adjustment) {
        return new SalaryAdjustmentResponse(
                adjustment.getId().toString(),
                adjustment.getAdjustmentType(),
                adjustment.getAmountPaise(),
                adjustment.getReason(),
                adjustment.getCreatedAt().toString());
    }
}
