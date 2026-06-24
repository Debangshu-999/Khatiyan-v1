package com.khatiyan.d_modules.notification.service;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import lombok.extern.slf4j.Slf4j;

/**
 * Scheduled jobs owned by the notification module.
 */
@Slf4j
@Component
public class NotificationSchedulerService {

    private final PushDeliveryService pushDeliveryService;
    private final NotificationService notificationService;

    public NotificationSchedulerService(
            PushDeliveryService pushDeliveryService,
            NotificationService notificationService) {
        this.pushDeliveryService = pushDeliveryService;
        this.notificationService = notificationService;
    }

    /**
     * Processes durable push jobs from the database-backed queue.
     *
     * <p>Intentionally NOT annotated with {@code @SchedulerLock}: this job is a
     * parallel queue consumer that coordinates workers via PostgreSQL
     * {@code FOR UPDATE SKIP LOCKED} plus a per-row lease (see
     * {@link PushDeliveryService}). A coarse ShedLock would serialise the drain
     * to a single instance and hold one lock across slow provider calls, so the
     * row-level claim is the correct mechanism here.
     */
    @Scheduled(
            cron = "${app.notification.push-delivery-cron:0 */1 * * * *}",
            zone = "${app.notification.push-delivery-zone:Asia/Kolkata}")
    public void deliverDuePushNotifications() {
        int processedCount = pushDeliveryService.deliverDuePushNotifications(100);

        if (processedCount > 0) {
            log.info("Notification scheduler processed push notifications count={}", processedCount);
        } else {
            log.info("Notification scheduler found no push notifications to deliver");
        }
    }

    /**
     * Archives old in-app notification recipient rows.
     */
    @EventListener(ApplicationReadyEvent.class)
    @SchedulerLock(name = "notification-cleanupStartupCatchUp", lockAtMostFor = "PT15M", lockAtLeastFor = "PT15S")
    public void archiveOldNotificationsOnStartup() {
        log.info("Notification cleanup scheduler startup catch-up started");
        archiveOldNotifications();
    }

    /**
     * Archives old in-app notification recipient rows.
     */
    @Scheduled(
            cron = "${app.notification.cleanup-cron:0 0 0 * * *}",
            zone = "${app.notification.cleanup-zone:Asia/Kolkata}")
    @SchedulerLock(name = "notification-archiveOldNotifications", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void archiveOldNotifications() {
        int archivedCount = notificationService.archiveOldNotifications();

        if (archivedCount > 0) {
            log.info("Notification scheduler archived old notifications count={}", archivedCount);
        } else {
            log.info("Notification scheduler found no old notifications to archive");
        }
    }
}
