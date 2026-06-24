package com.khatiyan.d_modules.reminder;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.reminder.service.ReminderSchedulerService;
import com.khatiyan.d_modules.reminder.service.ReminderService;
import org.springframework.context.annotation.Profile;

@Component
public class ReminderModule {

    private final ReminderService reminderService;
    private final ReminderSchedulerService reminderSchedulerService;

    public ReminderModule(
            ReminderService reminderService,
            ReminderSchedulerService reminderSchedulerService) {
        this.reminderService = reminderService;
        this.reminderSchedulerService = reminderSchedulerService;
    }

    public int processDueReminders() {
        return reminderService.processDueReminders();
    }

    public int scanAndCreateDueReminders() {
        return reminderSchedulerService.scanAndCreateDueReminders();
    }
}
