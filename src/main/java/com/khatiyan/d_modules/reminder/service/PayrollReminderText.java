package com.khatiyan.d_modules.reminder.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.Locale;

/**
 * Wording shared by the payroll reminders.
 *
 * <p>Both scanners name the same month and the same money in the same sentence
 * shape, and two reminders about one payroll that spell amounts differently read
 * as two systems talking.
 */
final class PayrollReminderText {

    private PayrollReminderText() {
    }

    /** "August 2026" — payroll months are always the first of a month. */
    static String monthLabel(LocalDate payrollMonth) {
        YearMonth month = YearMonth.from(payrollMonth);
        return "%s %d".formatted(
                month.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH),
                month.getYear());
    }

    static String formatPaise(long amountPaise) {
        return "Rs. %.2f".formatted(amountPaise / 100.0);
    }

    /** "salary" / "salaries", so the caller is not left counting in the middle of a sentence. */
    static String salaryNoun(int count) {
        return count == 1 ? "salary" : "salaries";
    }
}
