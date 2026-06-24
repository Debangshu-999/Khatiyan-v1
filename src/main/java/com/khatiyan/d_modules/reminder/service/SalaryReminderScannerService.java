package com.khatiyan.d_modules.reminder.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.reminder.model.ReminderSourceType;
import com.khatiyan.d_modules.reminder.model.ReminderType;
import com.khatiyan.d_modules.staff.StaffModule;
import com.khatiyan.d_modules.staff.api.dto.SalaryPaymentDueItem;

import lombok.extern.slf4j.Slf4j;

/**
 * Reminds the property owner, towards the end of the month, to pay staff
 * salaries that are still unpaid for the current month and record them in the
 * app. Daily-wage employees have no salary account, so they are never scanned.
 */
@Slf4j
@Service
public class SalaryReminderScannerService {

    private final StaffModule staffModule;
    private final PropertyModule propertyModule;
    private final ReminderService reminderService;
    private final long remindWithinDaysOfMonthEnd;

    public SalaryReminderScannerService(
            StaffModule staffModule,
            PropertyModule propertyModule,
            ReminderService reminderService,
            @Value("${app.salary.reminder-days-before-month-end:4}") long remindWithinDaysOfMonthEnd) {
        this.staffModule = staffModule;
        this.propertyModule = propertyModule;
        this.reminderService = reminderService;
        this.remindWithinDaysOfMonthEnd = remindWithinDaysOfMonthEnd;
    }

    public int scan(LocalDate today) {
        LocalDate monthEnd = YearMonth.from(today).atEndOfMonth();
        if (ChronoUnit.DAYS.between(today, monthEnd) > remindWithinDaysOfMonthEnd) {
            return 0;
        }

        int createdCount = 0;
        for (SalaryPaymentDueItem item : staffModule.listSalaryPaymentDue(today)) {
            PropertyResponse property = propertyModule.getActiveProperty(item.propertyId());
            UUID ownerUserId = property.ownerId();

            String reminderKey = "SALARY_PAYMENT_DUE:%s:%s:%s".formatted(
                    item.accountId(),
                    ownerUserId,
                    YearMonth.from(item.payrollMonth()));

            var created = reminderService.createPendingIfAbsent(
                    reminderKey,
                    ReminderType.SALARY_PAYMENT_DUE,
                    ReminderSourceType.SALARY_ACCOUNT,
                    item.accountId(),
                    ownerUserId,
                    item.propertyId(),
                    null,
                    today,
                    "Staff salary due",
                    "%s's salary of %s for %s at %s is still unpaid. Pay it and record the payment before the month ends.".formatted(
                            item.holderName(),
                            formatPaise(item.outstandingPaise()),
                            monthLabel(item.payrollMonth()),
                            property.name()),
                    NotificationCategory.PROPERTY,
                    NotificationPriority.HIGH,
                    NotificationDeliveryMode.IN_APP_AND_PUSH,
                    NotificationAudience.MANAGEMENT);

            if (created.isPresent()) {
                createdCount = createdCount + 1;
            }
        }

        if (createdCount > 0) {
            log.info("Salary reminder scan created reminders count={} today={}", createdCount, today);
        }

        return createdCount;
    }

    private String monthLabel(LocalDate payrollMonth) {
        YearMonth month = YearMonth.from(payrollMonth);
        return "%s %d".formatted(
                month.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH),
                month.getYear());
    }

    private String formatPaise(long amountPaise) {
        return "Rs. %.2f".formatted(amountPaise / 100.0);
    }
}
