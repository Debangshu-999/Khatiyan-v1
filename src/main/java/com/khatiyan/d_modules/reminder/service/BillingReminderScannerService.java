package com.khatiyan.d_modules.reminder.service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.reminder.model.ReminderSourceType;
import com.khatiyan.d_modules.reminder.model.ReminderType;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class BillingReminderScannerService {

    private static final Set<Long> UPCOMING_DUE_REMINDER_DAYS = Set.of(3L, 1L, 0L);

    private final BillingModule billingModule;
    private final ReminderService reminderService;

    public BillingReminderScannerService(
            BillingModule billingModule,
            ReminderService reminderService) {
        this.billingModule = billingModule;
        this.reminderService = reminderService;
    }

    public int scan(LocalDate today) {
        int createdCount = 0;
        createdCount = createdCount + createUpcomingDueReminders(today);
        createdCount = createdCount + createOverdueReminders(today);
        return createdCount;
    }

    private int createUpcomingDueReminders(LocalDate today) {
        int createdCount = 0;
        List<BillingCycleResponse> cycles = billingModule.findCyclesDueBetweenForReminders(today, today.plusDays(3));

        for (BillingCycleResponse cycle : cycles) {
            long daysUntilDue = ChronoUnit.DAYS.between(today, cycle.rentDueDate());
            if (!UPCOMING_DUE_REMINDER_DAYS.contains(daysUntilDue)) {
                continue;
            }

            ReminderType reminderType = daysUntilDue == 0
                    ? ReminderType.BILL_DUE_TODAY
                    : ReminderType.BILL_DUE_SOON;

            String reminderKey = "%s:%s:%s:%s:%s".formatted(
                    reminderType,
                    cycle.id(),
                    cycle.tenantUserId(),
                    daysUntilDue,
                    today);

            var created = reminderService.createPendingIfAbsent(
                    reminderKey,
                    reminderType,
                    ReminderSourceType.BILLING_CYCLE,
                    cycle.id(),
                    cycle.tenantUserId(),
                    cycle.propertyId(),
                    cycle.tenancyId(),
                    today,
                    dueReminderTitle(daysUntilDue),
                    dueReminderBody(cycle, daysUntilDue),
                    NotificationCategory.PAYMENT,
                    NotificationPriority.HIGH,
                    NotificationDeliveryMode.IN_APP_AND_PUSH,
                    NotificationAudience.TENANT);

            if (created.isPresent()) {
                createdCount = createdCount + 1;
            }
        }

        return createdCount;
    }

    private int createOverdueReminders(LocalDate today) {
        int createdCount = 0;
        List<BillingCycleResponse> cycles = billingModule.findOverdueCyclesForReminders();

        for (BillingCycleResponse cycle : cycles) {
            String tenantReminderKey = "BILL_OVERDUE:TENANT:%s:%s:%s".formatted(
                    cycle.id(),
                    cycle.tenantUserId(),
                    today);

            var tenantReminder = reminderService.createPendingIfAbsent(
                    tenantReminderKey,
                    ReminderType.BILL_OVERDUE,
                    ReminderSourceType.BILLING_CYCLE,
                    cycle.id(),
                    cycle.tenantUserId(),
                    cycle.propertyId(),
                    cycle.tenancyId(),
                    today,
                    "Rent bill overdue",
                    "Your rent bill of %s is overdue. Please complete the payment.".formatted(
                            formatPaise(cycle.totalAmountPaise())),
                    NotificationCategory.PAYMENT,
                    NotificationPriority.URGENT,
                    NotificationDeliveryMode.IN_APP_AND_PUSH,
                    NotificationAudience.TENANT);

            if (tenantReminder.isPresent()) {
                createdCount = createdCount + 1;
            }
        }

        return createdCount;
    }

    private String formatPaise(long amountPaise) {
        return "Rs. %.2f".formatted(amountPaise / 100.0);
    }

    private String dueReminderTitle(long daysUntilDue) {
        if (daysUntilDue == 0) {
            return "Rent due today";
        }
        if (daysUntilDue == 1) {
            return "Rent due tomorrow";
        }
        return "Rent due soon";
    }

    private String dueReminderBody(BillingCycleResponse cycle, long daysUntilDue) {
        if (daysUntilDue == 0) {
            return "Your rent bill of %s is due today.".formatted(formatPaise(cycle.totalAmountPaise()));
        }
        if (daysUntilDue == 1) {
            return "Your rent bill of %s is due tomorrow, %s.".formatted(
                    formatPaise(cycle.totalAmountPaise()),
                    cycle.rentDueDate());
        }
        return "Your rent bill of %s is due in %d days, on %s.".formatted(
                formatPaise(cycle.totalAmountPaise()),
                daysUntilDue,
                cycle.rentDueDate());
    }
}
