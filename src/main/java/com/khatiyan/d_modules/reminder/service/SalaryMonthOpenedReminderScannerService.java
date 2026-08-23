package com.khatiyan.d_modules.reminder.service;

import static com.khatiyan.d_modules.reminder.service.PayrollReminderText.formatPaise;
import static com.khatiyan.d_modules.reminder.service.PayrollReminderText.monthLabel;
import static com.khatiyan.d_modules.reminder.service.PayrollReminderText.salaryNoun;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

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
import com.khatiyan.d_modules.staff.api.dto.SalaryMonthOpenItem;

import lombok.extern.slf4j.Slf4j;

/**
 * Tells the owner, at the start of the payroll month, that salaries are now
 * recordable.
 *
 * <p>Khatiyan does not pay anyone — it keeps the record — so the thing an owner
 * actually forgets is not the payment but writing it down. The end-of-month
 * {@link SalaryReminderScannerService} chases what is still unpaid; this one
 * opens the month, so the task appears when it becomes doable rather than only
 * when it becomes late.
 *
 * <p><b>Batched per property, except new joiners.</b> A property with eight
 * monthly staff would otherwise fire eight notifications at 00:40 on the 1st,
 * which is how a useful reminder becomes something people mute. An employee's
 * FIRST salary month is announced on its own instead: it is news about a person
 * rather than a monthly rollover, it can land on any day of the month, and it
 * carries the name and amount the owner needs to act.
 *
 * <p>No new state tracks what has been announced — the reminder key does it.
 * {@code createPendingIfAbsent} is keyed by property (or account) and payroll
 * month, so the nightly scan creates each reminder once and skips it thereafter.
 */
@Slf4j
@Service
public class SalaryMonthOpenedReminderScannerService {

    private final StaffModule staffModule;
    private final PropertyModule propertyModule;
    private final ReminderService reminderService;

    public SalaryMonthOpenedReminderScannerService(
            StaffModule staffModule,
            PropertyModule propertyModule,
            ReminderService reminderService) {
        this.staffModule = staffModule;
        this.propertyModule = propertyModule;
        this.reminderService = reminderService;
    }

    public int scan(LocalDate today) {
        Map<UUID, List<SalaryMonthOpenItem>> rolloversByProperty = new LinkedHashMap<>();
        int createdCount = 0;

        for (SalaryMonthOpenItem item : staffModule.listOpenSalaryMonths(today)) {
            if (item.firstMonthForAccount()) {
                createdCount += announceNewJoiner(item, today) ? 1 : 0;
                continue;
            }
            rolloversByProperty.computeIfAbsent(item.propertyId(), key -> new ArrayList<>()).add(item);
        }

        for (Map.Entry<UUID, List<SalaryMonthOpenItem>> entry : rolloversByProperty.entrySet()) {
            createdCount += announceProperty(entry.getKey(), entry.getValue(), today) ? 1 : 0;
        }

        if (createdCount > 0) {
            log.info("Salary month opened scan created reminders count={} today={}", createdCount, today);
        }

        return createdCount;
    }

    private boolean announceNewJoiner(SalaryMonthOpenItem item, LocalDate today) {
        PropertyResponse property = propertyModule.getActiveProperty(item.propertyId());
        String reminderKey = "SALARY_ACCOUNT_OPENED:%s:%s".formatted(
                item.accountId(),
                YearMonth.from(item.payrollMonth()));

        return reminderService.createPendingIfAbsent(
                reminderKey,
                ReminderType.SALARY_ACCOUNT_OPENED,
                ReminderSourceType.SALARY_ACCOUNT,
                item.accountId(),
                property.ownerId(),
                item.propertyId(),
                null,
                today,
                "Salary account opened",
                "%s's salary account at %s is now open. Record their %s salary of %s before the month ends.".formatted(
                        item.holderName(),
                        property.name(),
                        monthLabel(item.payrollMonth()),
                        formatPaise(item.netPaise())),
                NotificationCategory.PROPERTY,
                NotificationPriority.NORMAL,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.MANAGEMENT).isPresent();
    }

    private boolean announceProperty(UUID propertyId, List<SalaryMonthOpenItem> items, LocalDate today) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        LocalDate payrollMonth = items.get(0).payrollMonth();
        long totalPaise = items.stream().mapToLong(SalaryMonthOpenItem::netPaise).sum();

        // Property-scoped, so the batch is announced once however many nights the
        // scan runs, and however many employees land in it.
        String reminderKey = "SALARY_MONTHS_OPENED:%s:%s".formatted(
                propertyId,
                YearMonth.from(payrollMonth));

        return reminderService.createPendingIfAbsent(
                reminderKey,
                ReminderType.SALARY_MONTHS_OPENED,
                ReminderSourceType.SALARY_PAYROLL,
                propertyId,
                property.ownerId(),
                propertyId,
                null,
                today,
                "Salaries ready to record",
                "%d %s totalling %s for %s %s now open at %s. Record the payments before the month ends.".formatted(
                        items.size(),
                        salaryNoun(items.size()),
                        formatPaise(totalPaise),
                        monthLabel(payrollMonth),
                        items.size() == 1 ? "is" : "are",
                        property.name()),
                NotificationCategory.PROPERTY,
                NotificationPriority.NORMAL,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.MANAGEMENT).isPresent();
    }
}
