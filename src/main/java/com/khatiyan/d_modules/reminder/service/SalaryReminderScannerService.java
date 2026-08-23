package com.khatiyan.d_modules.reminder.service;

import static com.khatiyan.d_modules.reminder.service.PayrollReminderText.formatPaise;
import static com.khatiyan.d_modules.reminder.service.PayrollReminderText.monthLabel;
import static com.khatiyan.d_modules.reminder.service.PayrollReminderText.salaryNoun;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
 * Reminds the property owner, towards the end of the month, that salaries are
 * still unpaid for the current month and need paying and recording.
 *
 * <p>Daily-wage employees have no salary account, so they are never scanned.
 *
 * <p><b>The window is the point.</b> The condition — "this salary is unpaid" —
 * is true from the day the month opens, and nagging about it from the 2nd for
 * something normally paid on the 30th is noise. So the scan does nothing until
 * the month is within {@code app.salary.reminder-days-before-month-end} days of
 * closing. The Action Center is where an owner sees outstanding salary the rest
 * of the time; this is the last call.
 *
 * <p><b>One reminder per property, not per employee.</b> The key is property +
 * owner + payroll month, so a property with eight unpaid salaries produces one
 * notification naming the count and the total rather than eight naming one each.
 * {@link SalaryMonthOpenedReminderScannerService} batches the same way at the
 * other end of the month.
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

        Map<UUID, List<SalaryPaymentDueItem>> byProperty = new LinkedHashMap<>();
        for (SalaryPaymentDueItem item : staffModule.listSalaryPaymentDue(today)) {
            byProperty.computeIfAbsent(item.propertyId(), key -> new ArrayList<>()).add(item);
        }

        int createdCount = 0;
        for (Map.Entry<UUID, List<SalaryPaymentDueItem>> entry : byProperty.entrySet()) {
            createdCount += remindProperty(entry.getKey(), entry.getValue(), today) ? 1 : 0;
        }

        if (createdCount > 0) {
            log.info("Salary reminder scan created reminders count={} today={}", createdCount, today);
        }

        return createdCount;
    }

    private boolean remindProperty(UUID propertyId, List<SalaryPaymentDueItem> items, LocalDate today) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        UUID ownerUserId = property.ownerId();
        LocalDate payrollMonth = items.get(0).payrollMonth();
        long outstandingPaise = items.stream().mapToLong(SalaryPaymentDueItem::outstandingPaise).sum();

        String reminderKey = "SALARY_PAYMENT_DUE:%s:%s:%s".formatted(
                propertyId,
                ownerUserId,
                YearMonth.from(payrollMonth));

        return reminderService.createPendingIfAbsent(
                reminderKey,
                ReminderType.SALARY_PAYMENT_DUE,
                ReminderSourceType.SALARY_PAYROLL,
                propertyId,
                ownerUserId,
                propertyId,
                null,
                today,
                "Staff salary due",
                body(items, outstandingPaise, payrollMonth, property.name()),
                NotificationCategory.PROPERTY,
                NotificationPriority.HIGH,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.MANAGEMENT).isPresent();
    }

    /**
     * A lone unpaid salary is named; several are counted.
     *
     * <p>"1 salary totalling Rs. 12000.00 is unpaid" is a worse sentence than
     * naming the person, and when there is only one the name is the useful part.
     */
    private String body(
            List<SalaryPaymentDueItem> items,
            long outstandingPaise,
            LocalDate payrollMonth,
            String propertyName) {
        if (items.size() == 1) {
            return "%s's salary of %s for %s at %s is still unpaid. Pay it and record the payment before the month ends."
                    .formatted(
                            items.get(0).holderName(),
                            formatPaise(outstandingPaise),
                            monthLabel(payrollMonth),
                            propertyName);
        }

        return "%d %s totalling %s for %s at %s are still unpaid. Pay them and record the payments before the month ends."
                .formatted(
                        items.size(),
                        salaryNoun(items.size()),
                        formatPaise(outstandingPaise),
                        monthLabel(payrollMonth),
                        propertyName);
    }
}
