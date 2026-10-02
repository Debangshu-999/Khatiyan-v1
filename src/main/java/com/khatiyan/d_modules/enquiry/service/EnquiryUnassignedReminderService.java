package com.khatiyan.d_modules.enquiry.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.concurrency.RecordByRecord;
import com.khatiyan.d_modules.enquiry.repository.EnquiryRepository;
import com.khatiyan.d_modules.enquiry.repository.EnquiryRepository.UnassignedCount;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Reminds an owner, once a day, about enquiries still waiting for a handler.
 *
 * <p>Only where the owner assigns each enquiry. In that mode nobody else may
 * act on one until the owner gives it to someone, so an enquiry the owner has
 * not looked at is an enquiry nobody can answer. In the other two modes there
 * is nothing to remind about: the system assigns on arrival, or the first
 * person to respond takes it.
 *
 * <p>One notice per property, with the count, however many are waiting. Two
 * reads for the whole run, whatever the number of properties: the counts, then
 * the properties they belong to.
 */
@Slf4j
@Service
public class EnquiryUnassignedReminderService {

    private final EnquiryRepository enquiryRepository;
    private final PropertyModule propertyModule;
    private final NotificationModule notificationModule;
    private final RecordByRecord recordByRecord;

    public EnquiryUnassignedReminderService(
            EnquiryRepository enquiryRepository,
            PropertyModule propertyModule,
            NotificationModule notificationModule,
            RecordByRecord recordByRecord) {
        this.enquiryRepository = enquiryRepository;
        this.propertyModule = propertyModule;
        this.notificationModule = notificationModule;
        this.recordByRecord = recordByRecord;
    }

    @Scheduled(cron = "${app.enquiry.unassigned-reminder-cron}", zone = "${app.enquiry.expiry-zone}")
    @SchedulerLock(name = "enquiry-unassignedReminder", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void remindOwners() {
        int reminded = remindOwners(Instant.now());
        log.info("Enquiry unassigned reminder told {} owners", reminded);
    }

    /** @return how many properties' owners were reminded */
    public int remindOwners(Instant now) {
        List<UnassignedCount> waiting = enquiryRepository.countUnassignedWhereOwnerAssigns(now);
        if (waiting.isEmpty()) {
            return 0;
        }

        Map<UUID, PropertyResponse> properties = propertyModule
                .findActiveProperties(waiting.stream().map(UnassignedCount::getPropertyId).toList())
                .stream()
                .collect(Collectors.toMap(PropertyResponse::id, Function.identity()));

        int reminded = 0;
        for (UnassignedCount count : waiting) {
            PropertyResponse property = properties.get(count.getPropertyId());
            // An inactive property takes no enquiries and needs no reminder.
            if (property == null) {
                continue;
            }
            // Each owner on their own, so one failed notice does not stop the rest.
            if (recordByRecord.attempt("enquiry-unassigned-reminder", property.id(), () -> {
                remind(property, count.getWaiting());
                return true;
            })) {
                reminded++;
            }
        }
        return reminded;
    }

    private void remind(PropertyResponse property, long waiting) {
        notificationModule.notifyUser(
                property.ownerId(),
                "Enquiries waiting for a handler",
                waiting == 1
                        ? "1 enquiry for " + property.name() + " has no handler yet. Assign it so someone can respond."
                        : waiting + " enquiries for " + property.name()
                                + " have no handler yet. Assign them so someone can respond.",
                NotificationCategory.ENQUIRY,
                NotificationPriority.NORMAL,
                NotificationSubtype.ENQUIRY_UNASSIGNED,
                property.id(),
                Map.of("propertyId", property.id().toString()),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }
}
