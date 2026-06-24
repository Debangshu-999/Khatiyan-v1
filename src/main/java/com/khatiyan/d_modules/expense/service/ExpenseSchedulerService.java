package com.khatiyan.d_modules.expense.service;

import java.time.LocalDate;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import lombok.extern.slf4j.Slf4j;

/**
 * Scheduled jobs owned by the expense module. Currently materialises recurring
 * expense templates for the current month; the budget-alert scan will be added
 * alongside the reminder integration.
 */
@Slf4j
@Component
public class ExpenseSchedulerService {

    private final RecurringExpenseService recurringExpenseService;

    public ExpenseSchedulerService(RecurringExpenseService recurringExpenseService) {
        this.recurringExpenseService = recurringExpenseService;
    }

    @EventListener(ApplicationReadyEvent.class)
    @SchedulerLock(name = "expense-recurringStartupCatchUp", lockAtMostFor = "PT15M", lockAtLeastFor = "PT15S")
    public void generateRecurringExpensesOnStartup() {
        log.info("Recurring expense generator startup catch-up started");
        generate();
    }

    @Scheduled(
            cron = "${app.expense.recurring-generation-cron:0 50 0 * * *}",
            zone = "${app.expense.recurring-generation-zone:Asia/Kolkata}")
    @SchedulerLock(name = "expense-generateRecurringExpenses", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void generateRecurringExpensesOnSchedule() {
        generate();
    }

    private void generate() {
        int generated = recurringExpenseService.generateDueRecurringExpenses(LocalDate.now());
        if (generated > 0) {
            log.info("Recurring expense generator created expenses count={}", generated);
        } else {
            log.info("Recurring expense generator found no templates due");
        }
    }
}
