package com.khatiyan.d_modules.reminder.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.khatiyan.d_modules.concerns.ConcernModule;
import com.khatiyan.d_modules.concerns.api.dto.ConcernResponse;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.reminder.model.ReminderSourceType;
import com.khatiyan.d_modules.reminder.model.ReminderType;

@Service
public class ConcernReminderScannerService {

    private final ConcernModule concernModule;
    private final PropertyModule propertyModule;
    private final ReminderService reminderService;

    public ConcernReminderScannerService(
            ConcernModule concernModule,
            PropertyModule propertyModule,
            ReminderService reminderService) {
        this.concernModule = concernModule;
        this.propertyModule = propertyModule;
        this.reminderService = reminderService;
    }

    public int scan(LocalDate today) {
        int createdCount = 0;
        Instant createdBefore = Instant.now().minus(24, ChronoUnit.HOURS);
        List<ConcernResponse> concerns = concernModule.findOpenUnassignedCreatedBefore(createdBefore);

        for (ConcernResponse concern : concerns) {
            PropertyResponse property = propertyModule.getActiveProperty(concern.propertyId());
            List<UUID> recipients = new ArrayList<>();
            recipients.add(property.ownerId());
            recipients.addAll(propertyModule.findActiveManagerUserIds(property.id()));

            for (UUID recipientUserId : recipients.stream().distinct().toList()) {
                String reminderKey = "CONCERN_UNATTENDED:%s:%s:%s".formatted(
                        concern.id(),
                        recipientUserId,
                        today);

                var created = reminderService.createPendingIfAbsent(
                        reminderKey,
                        ReminderType.CONCERN_UNATTENDED,
                        ReminderSourceType.CONCERN,
                        concern.id(),
                        recipientUserId,
                        concern.propertyId(),
                        concernModule.findTenancyIdForConcern(concern.id()),
                        today,
                        "Concern needs attention",
                        "A concern at %s has been open for more than 24 hours: %s".formatted(
                                property.name(),
                        concern.title()),
                        NotificationCategory.CONCERN,
                        NotificationPriority.HIGH,
                        NotificationDeliveryMode.IN_APP_AND_PUSH,
                        NotificationAudience.MANAGEMENT);

                if (created.isPresent()) {
                    createdCount = createdCount + 1;
                }
            }
        }

        return createdCount;
    }
}
