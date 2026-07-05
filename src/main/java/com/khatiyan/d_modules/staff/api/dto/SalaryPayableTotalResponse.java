package com.khatiyan.d_modules.staff.api.dto;

/**
 * Property-wide salary payable for the current (IST) month — opened salary-month
 * net where a month has been opened, otherwise the projected payout. Shown as the
 * total at the bottom of the owner salary tab.
 */
public record SalaryPayableTotalResponse(long totalPayableThisMonthPaise) {
}
