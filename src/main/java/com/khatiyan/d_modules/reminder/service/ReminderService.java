package com.khatiyan.d_modules.reminder.service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.reminder.model.ReminderRecord;
import com.khatiyan.d_modules.reminder.model.ReminderSourceType;
import com.khatiyan.d_modules.reminder.model.ReminderStatus;
import com.khatiyan.d_modules.reminder.model.ReminderType;
import com.khatiyan.d_modules.reminder.repository.ReminderRecordRepository;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class ReminderService {

    private final ReminderRecordRepository reminderRecordRepository;
    private final NotificationModule notificationModule;
    private final TransactionTemplate transactionTemplate;
    private final int batchSize;

    public ReminderService(
            ReminderRecordRepository reminderRecordRepository,
            NotificationModule notificationModule,
            TransactionTemplate transactionTemplate,
            @Value("${app.reminder.processing-batch-size:100}") int batchSize) {
        this.reminderRecordRepository = reminderRecordRepository;
        this.notificationModule = notificationModule;
        this.transactionTemplate = transactionTemplate;
        this.batchSize = batchSize;
    }

    public Optional<ReminderRecord> createPendingIfAbsent(
            String reminderKey,
            ReminderType reminderType,
            ReminderSourceType sourceType,
            UUID sourceId,
            UUID recipientUserId,
            UUID propertyId,
            UUID tenancyId,
            LocalDate scheduledForDate,
            String title,
            String body,
            NotificationCategory notificationCategory,
            NotificationPriority notificationPriority,
            NotificationDeliveryMode deliveryMode,
            NotificationAudience audience) {
        return transactionTemplate.execute(status -> {
            Optional<ReminderRecord> existing = reminderRecordRepository.findByReminderKey(reminderKey);
            if (existing.isPresent()) {
                log.debug("Reminder skipped because key already exists reminderKey={}", reminderKey);
                return Optional.empty();
            }

            ReminderRecord reminder = ReminderRecord.pending(
                    reminderKey,
                    reminderType,
                    sourceType,
                    sourceId,
                    recipientUserId,
                    propertyId,
                    tenancyId,
                    scheduledForDate,
                    title,
                    body,
                    notificationCategory,
                    notificationPriority,
                    deliveryMode,
                    audience);

            try {
                ReminderRecord saved = reminderRecordRepository.save(reminder);
                log.info(
                        "Reminder created reminderId={} reminderKey={} type={} recipientUserId={}",
                        saved.getId(),
                        saved.getReminderKey(),
                        saved.getReminderType(),
                        saved.getRecipientUserId());
                return Optional.of(saved);
            } catch (DataIntegrityViolationException exception) {
                log.debug("Reminder skipped after duplicate key race reminderKey={}", reminderKey);
                return Optional.empty();
            }
        });
    }

    public int processDueReminders() {
        LocalDate today = LocalDate.now();

        return transactionTemplate.execute(status -> {
            List<ReminderRecord> dueReminders = reminderRecordRepository.findDueByStatus(
                    ReminderStatus.PENDING,
                    today,
                    PageRequest.of(0, batchSize));

            int processedCount = 0;
            for (ReminderRecord reminder : dueReminders) {
                try {
                    // Carry the reminder's property/tenancy references into the
                    // notification data payload so the alert feeds can scope by
                    // property, and map budget reminder types to their subtype so
                    // the UI can classify and render them.
                    Map<String, String> data = new LinkedHashMap<>();
                    if (reminder.getPropertyId() != null) {
                        data.put("propertyId", reminder.getPropertyId().toString());
                    }
                    if (reminder.getTenancyId() != null) {
                        data.put("tenancyId", reminder.getTenancyId().toString());
                    }

                    notificationModule.notifyUser(
                            reminder.getRecipientUserId(),
                            reminder.getTitle(),
                            reminder.getBody(),
                            reminder.getNotificationCategory(),
                            reminder.getNotificationPriority(),
                            subtypeFor(reminder.getReminderType()),
                            reminder.getSourceId(),
                            data,
                            reminder.getDeliveryMode(),
                            reminder.getAudience());

                    reminder.markSent(Instant.now());
                    processedCount = processedCount + 1;
                } catch (RuntimeException exception) {
                    reminder.markFailed();
                    log.error(
                            "Reminder failed reminderId={} type={} recipientUserId={}",
                            reminder.getId(),
                            reminder.getReminderType(),
                            reminder.getRecipientUserId(),
                            exception);
                }
            }

            if (processedCount == 0) {
                log.info("Reminder processor found no due reminders today={}", today);
            } else {
                log.info("Reminder processor completed processedCount={} today={}", processedCount, today);
            }

            return processedCount;
        });
    }

    /**
     * Maps a reminder type to a notification subtype where one exists. Only the
     * budget reminders currently have a matching subtype; the rest fall through
     * to null (the notification carries no subtype, same as before).
     */
    private static NotificationSubtype subtypeFor(ReminderType reminderType) {
        return switch (reminderType) {
            case BUDGET_APPROACHING -> NotificationSubtype.BUDGET_APPROACHING;
            case BUDGET_EXCEEDED -> NotificationSubtype.BUDGET_EXCEEDED;
            default -> null;
        };
    }
}
