package com.khatiyan.d_modules.reminder.service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.reminder.model.ReminderSourceType;
import com.khatiyan.d_modules.reminder.model.ReminderType;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

@Service
public class TenancyReminderScannerService {

    private static final Set<Long> REMINDER_DAYS = Set.of(7L, 3L, 1L, 0L);

    private final TenancyModule tenancyModule;
    private final PropertyModule propertyModule;
    private final ReminderService reminderService;

    public TenancyReminderScannerService(
            TenancyModule tenancyModule,
            PropertyModule propertyModule,
            ReminderService reminderService) {
        this.tenancyModule = tenancyModule;
        this.propertyModule = propertyModule;
        this.reminderService = reminderService;
    }

    public int scan(LocalDate today) {
        int createdCount = 0;
        List<TenancyResponse> tenancies = tenancyModule.findActiveEndingBetween(today, today.plusDays(7));

        for (TenancyResponse tenancy : tenancies) {
            long daysUntilEnd = ChronoUnit.DAYS.between(today, tenancy.endDate());
            if (!REMINDER_DAYS.contains(daysUntilEnd)) {
                continue;
            }

            PropertyResponse property = propertyModule.getActiveProperty(tenancy.propertyId());
            List<UUID> recipients = new ArrayList<>();
            recipients.add(tenancy.userId());
            recipients.add(property.ownerId());
            recipients.addAll(propertyModule.findActiveManagerUserIds(property.id()));

            for (UUID recipientUserId : recipients.stream().distinct().toList()) {
                String reminderKey = "TENANCY_ENDING:%s:%s:%s:%s".formatted(
                        tenancy.id(),
                        recipientUserId,
                        daysUntilEnd,
                        today);

                var created = reminderService.createPendingIfAbsent(
                        reminderKey,
                        ReminderType.TENANCY_ENDING_SOON,
                        ReminderSourceType.TENANCY,
                        tenancy.id(),
                        recipientUserId,
                        tenancy.propertyId(),
                        tenancy.id(),
                        today,
                        title(daysUntilEnd),
                        body(property.name(), tenancy.endDate(), daysUntilEnd),
                        NotificationCategory.TENANCY,
                        daysUntilEnd == 0 ? NotificationPriority.URGENT : NotificationPriority.HIGH,
                        NotificationDeliveryMode.IN_APP_AND_PUSH);

                if (created.isPresent()) {
                    createdCount = createdCount + 1;
                }
            }
        }

        return createdCount;
    }

    private String title(long daysUntilEnd) {
        if (daysUntilEnd == 0) {
            return "Tenancy ends today, vacate your room and submit keys at front desk";
        }
        if (daysUntilEnd == 1) {
            return "Tenancy ends tomorrow, plan your checkout accordingly";
        }
        return "Tenancy ending soon, plan your checkout accordingly";
    }

    private String body(String propertyName, LocalDate endDate, long daysUntilEnd) {
        if (daysUntilEnd == 0) {
            return "Your tenancy at %s is scheduled to end today.".formatted(propertyName);
        }
        if (daysUntilEnd == 1) {
            return "Your tenancy at %s is scheduled to end tomorrow, %s.".formatted(propertyName, endDate);
        }
        return "Your tenancy at %s is scheduled to end in %d days, on %s.".formatted(
                propertyName,
                daysUntilEnd,
                endDate);
    }
}
