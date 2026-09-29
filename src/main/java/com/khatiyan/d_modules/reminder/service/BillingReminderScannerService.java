package com.khatiyan.d_modules.reminder.service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.model.BillingCycleCategory;
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
            // A daily guest stay has no account, so this bill has no tenant to
            // remind. The owner already knows about it — they raised it and
            // they will mark it paid — and there is no app for a reminder to
            // arrive in.
            if (cycle.tenantUserId() == null) {
                continue;
            }

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
                    dueReminderTitle(cycle, daysUntilDue),
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
            // Same as above: no account, nobody to remind. A guest bill cannot
            // reach OVERDUE anyway (see docs/modules/billing.md), so this is a
            // belt-and-braces guard rather than a live path.
            if (cycle.tenantUserId() == null) {
                continue;
            }

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
                    isOneOff(cycle) ? "Bill overdue" : "Rent bill overdue",
                    "Your %s of %s is overdue. Please complete the payment.".formatted(
                            billName(cycle), formatPaise(cycle.totalAmountPaise())),
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

    /**
     * A one-off bill (an extra charge, an exit penalty) is not rent, so its
     * reminders say "bill" (2026-09-29). They called every bill rent before.
     */
    private boolean isOneOff(BillingCycleResponse cycle) {
        return cycle.category() == BillingCycleCategory.ONE_OFF;
    }

    private String billName(BillingCycleResponse cycle) {
        return isOneOff(cycle) ? "one-off bill" : "rent bill";
    }

    private String dueReminderTitle(BillingCycleResponse cycle, long daysUntilDue) {
        String subject = isOneOff(cycle) ? "Bill" : "Rent";
        if (daysUntilDue == 0) {
            return subject + " due today";
        }
        if (daysUntilDue == 1) {
            return subject + " due tomorrow";
        }
        return subject + " due soon";
    }

    private String dueReminderBody(BillingCycleResponse cycle, long daysUntilDue) {
        if (daysUntilDue == 0) {
            return "Your %s of %s is due today.".formatted(billName(cycle), formatPaise(cycle.totalAmountPaise()));
        }
        if (daysUntilDue == 1) {
            return "Your %s of %s is due tomorrow, %s.".formatted(
                    billName(cycle),
                    formatPaise(cycle.totalAmountPaise()),
                    cycle.rentDueDate());
        }
        return "Your %s of %s is due in %d days, on %s.".formatted(
                billName(cycle),
                formatPaise(cycle.totalAmountPaise()),
                daysUntilDue,
                cycle.rentDueDate());
    }
}
