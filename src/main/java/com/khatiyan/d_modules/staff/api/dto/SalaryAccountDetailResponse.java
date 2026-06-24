package com.khatiyan.d_modules.staff.api.dto;

import java.util.List;

public record SalaryAccountDetailResponse(
        SalaryAccountResponse account,
        List<SalaryMonthResponse> months) {
}
