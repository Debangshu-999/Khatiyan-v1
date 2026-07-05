package com.khatiyan.d_modules.reminder.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Locale;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.khatiyan.d_modules.expense.ExpenseModule;
import com.khatiyan.d_modules.expense.api.dto.BudgetAlertCandidate;
import com.khatiyan.d_modules.expense.api.dto.BudgetAlertThreshold;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.reminder.model.ReminderSourceType;
import com.khatiyan.d_modules.reminder.model.ReminderType;

import lombok.extern.slf4j.Slf4j;

/**
 * Alerts the property owner when month-to-date expenses approach (>=80%) or
 * exceed the monthly budget. Fires at most once per threshold per month — the
 * reminder key is per property + owner + month — and surfaces in the alerts feed
 * via the standard reminder -> notification pipeline.
 */
@Slf4j
@Service
public class ExpenseBudgetReminderScannerService {

    private static final Locale INR = new Locale("en", "IN");

    private final ExpenseModule expenseModule;
    private final PropertyModule propertyModule;
    private final ReminderService reminderService;

    public ExpenseBudgetReminderScannerService(
            ExpenseModule expenseModule,
            PropertyModule propertyModule,
            ReminderService reminderService) {
        this.expenseModule = expenseModule;
        this.propertyModule = propertyModule;
        this.reminderService = reminderService;
    }

    public int scan(LocalDate today) {
        int createdCount = 0;
        for (BudgetAlertCandidate candidate : expenseModule.listBudgetAlertCandidates(today)) {
            PropertyResponse property = propertyModule.getActiveProperty(candidate.propertyId());
            UUID ownerUserId = property.ownerId();
            boolean exceeded = candidate.threshold() == BudgetAlertThreshold.EXCEEDED;
            ReminderType reminderType = exceeded ? ReminderType.BUDGET_EXCEEDED : ReminderType.BUDGET_APPROACHING;

            String reminderKey = "%s:%s:%s:%s".formatted(
                    reminderType,
                    candidate.propertyId(),
                    ownerUserId,
                    YearMonth.from(candidate.month()));

            var created = reminderService.createPendingIfAbsent(
                    reminderKey,
                    reminderType,
                    ReminderSourceType.EXPENSE_BUDGET,
                    candidate.propertyId(),
                    ownerUserId,
                    candidate.propertyId(),
                    null,
                    today,
                    exceeded ? "Monthly budget exceeded" : "Monthly budget almost reached",
                    body(property.name(), candidate, exceeded),
                    NotificationCategory.EXPENSE,
                    NotificationPriority.HIGH,
                    NotificationDeliveryMode.IN_APP_AND_PUSH,
                    NotificationAudience.MANAGEMENT);

            if (created.isPresent()) {
                createdCount = createdCount + 1;
            }
        }
        return createdCount;
    }

    private static String body(String propertyName, BudgetAlertCandidate candidate, boolean exceeded) {
        if (exceeded) {
            return "%s has spent %s this month, over its %s budget. Review expenses or raise the budget.".formatted(
                    propertyName, formatPaise(candidate.spentPaise()), formatPaise(candidate.budgetPaise()));
        }
        return "%s has spent %s of its %s budget this month. Watch spending or raise the budget.".formatted(
                propertyName, formatPaise(candidate.spentPaise()), formatPaise(candidate.budgetPaise()));
    }

    private static String formatPaise(long paise) {
        return String.format(INR, "₹%,d", paise / 100);
    }
}
