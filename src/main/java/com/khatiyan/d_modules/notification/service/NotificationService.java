package com.khatiyan.d_modules.notification.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.notification.api.dto.NotificationDeviceTokenResponse;
import com.khatiyan.d_modules.notification.api.dto.NotificationResponse;
import com.khatiyan.d_modules.notification.api.dto.RegisterNotificationDeviceRequest;
import com.khatiyan.d_modules.notification.model.Notification;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationDeviceToken;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationRecipient;
import com.khatiyan.d_modules.notification.model.PushNotification;
import com.khatiyan.d_modules.notification.repository.NotificationDeviceTokenRepository;
import com.khatiyan.d_modules.notification.repository.NotificationRecipientRepository;
import com.khatiyan.d_modules.notification.repository.NotificationRepository;
import com.khatiyan.d_modules.notification.repository.PushNotificationRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Application service for in-app notifications and durable push jobs.
 *
 * <p>This service creates the user-visible notification inbox rows first, then
 * creates push delivery rows that a scheduler can process safely after commit.
 */
@Slf4j
@Service
public class NotificationService {

    private static final Duration READ_NOTIFICATION_RETENTION = Duration.ofDays(30);
    private static final Duration UNREAD_NOTIFICATION_RETENTION = Duration.ofDays(90);

    private final NotificationRepository notificationRepository;
    private final NotificationRecipientRepository notificationRecipientRepository;
    private final PushNotificationRepository pushNotificationRepository;
    private final NotificationDeviceTokenRepository notificationDeviceTokenRepository;

    public NotificationService(
            NotificationRepository notificationRepository,
            NotificationRecipientRepository notificationRecipientRepository,
            PushNotificationRepository pushNotificationRepository,
            NotificationDeviceTokenRepository notificationDeviceTokenRepository) {
        this.notificationRepository = notificationRepository;
        this.notificationRecipientRepository = notificationRecipientRepository;
        this.pushNotificationRepository = pushNotificationRepository;
        this.notificationDeviceTokenRepository = notificationDeviceTokenRepository;
    }

    /**
     * Creates one notification for one user.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void notifyUser(
            UUID userId,
            String title,
            String body,
            NotificationCategory category,
            NotificationPriority priority,
            UUID sourceId,
            NotificationDeliveryMode deliveryMode) {
        createNotification(List.of(userId), title, body, category, priority, sourceId, deliveryMode);
    }

    /**
     * Creates one shared notification and one recipient/push row per user.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void notifyUsers(
            Collection<UUID> userIds,
            String title,
            String body,
            NotificationCategory category,
            NotificationPriority priority,
            UUID sourceId,
            NotificationDeliveryMode deliveryMode) {
        createNotification(userIds, title, body, category, priority, sourceId, deliveryMode);
    }

    private void createNotification(
            Collection<UUID> userIds,
            String title,
            String body,
            NotificationCategory category,
            NotificationPriority priority,
            UUID sourceId,
            NotificationDeliveryMode deliveryMode) {
        if (userIds == null || userIds.isEmpty()) {
            log.debug("Notification skipped because recipient list is empty category={} sourceId={}", category, sourceId);
            return;
        }
        NotificationDeliveryMode resolvedDeliveryMode =
                deliveryMode == null ? NotificationDeliveryMode.IN_APP_ONLY : deliveryMode;

        Instant now = Instant.now();
        Notification notification = Notification.create(title, body, category, priority, sourceId);
        Notification savedNotification = notificationRepository.save(notification);

        List<NotificationRecipient> recipients = userIds.stream()
                .distinct()
                .map(userId -> NotificationRecipient.create(savedNotification, userId))
                .toList();

        List<NotificationRecipient> savedRecipients = notificationRecipientRepository.saveAll(recipients);

        int pushCount = 0;
        if (resolvedDeliveryMode.isPushEnabled()) {
            List<PushNotification> pushNotifications = savedRecipients.stream()
                    .map(recipient -> PushNotification.create(recipient, now))
                    .toList();

            pushNotificationRepository.saveAll(pushNotifications);
            pushCount = pushNotifications.size();
        }

        log.info(
                "Notification created notificationId={} category={} priority={} deliveryMode={} recipients={} pushJobs={}",
                savedNotification.getId(),
                category,
                priority,
                resolvedDeliveryMode,
                savedRecipients.size(),
                pushCount);
    }

    /**
     * Lists the authenticated user's non-archived notification inbox.
     */
    @Transactional(readOnly = true)
    public List<NotificationResponse> listMyNotifications(UUID userId) {
        return notificationRecipientRepository.findVisibleByUserId(userId)
                .stream()
                .map(recipient -> NotificationResponse.from(recipient))
                .toList();
    }

    /**
     * Counts unread, non-archived notifications for the authenticated user.
     */
    @Transactional(readOnly = true)
    public long countMyUnreadNotifications(UUID userId) {
        return notificationRecipientRepository.countUnreadByUserId(userId);
    }

    /**
     * Marks one notification as read for the authenticated user.
     */
    @Transactional
    public NotificationResponse markRead(UUID userId, UUID recipientId) {
        NotificationRecipient recipient = getUserRecipient(userId, recipientId);
        recipient.markRead(Instant.now());

        log.info("Notification marked read recipientId={} userId={}", recipientId, userId);
        return NotificationResponse.from(recipient);
    }

    /**
     * Marks all currently visible notifications as read for the authenticated user.
     */
    @Transactional
    public void markAllRead(UUID userId) {
        Instant now = Instant.now();

        List<NotificationRecipient> recipients = notificationRecipientRepository.findVisibleByUserId(userId);
        recipients.forEach(recipient -> recipient.markRead(now));

        log.info("All visible notifications marked read userId={} count={}", userId, recipients.size());
    }

    /**
     * Archives one notification for the authenticated user.
     */
    @Transactional
    public void archive(UUID userId, UUID recipientId) {
        NotificationRecipient recipient = getUserRecipient(userId, recipientId);
        recipient.archive(Instant.now());

        log.info("Notification archived recipientId={} userId={}", recipientId, userId);
    }

    /**
     * Registers or refreshes a push token sent by the client app.
     */
    @Transactional
    public NotificationDeviceTokenResponse registerDevice(UUID userId, RegisterNotificationDeviceRequest request) {
        Instant now = Instant.now();

        notificationDeviceTokenRepository.upsertDeviceToken(
                UUID.randomUUID(),
                userId,
                request.provider().name(),
                request.providerToken(),
                request.platform().name(),
                now);

        NotificationDeviceToken saved = notificationDeviceTokenRepository
                .findByProviderAndProviderToken(request.provider(), request.providerToken())
                .orElseThrow(() -> new NotFoundException("NotificationDeviceToken_", request.providerToken()));

        log.info(
                "Notification device registered tokenId={} userId={} provider={} platform={}",
                saved.getId(),
                userId,
                saved.getProvider(),
                saved.getPlatform());

        return NotificationDeviceTokenResponse.from(saved);
    }

    /**
     * Lists active push tokens for the authenticated user.
     */
    @Transactional(readOnly = true)
    public List<NotificationDeviceTokenResponse> listMyDevices(UUID userId) {
        return notificationDeviceTokenRepository.findActiveByUserId(userId)
                .stream()
                .map(token -> NotificationDeviceTokenResponse.from(token))
                .toList();
    }

    /**
     * Deactivates a push token owned by the authenticated user.
     */
    @Transactional
    public void deactivateDevice(UUID userId, UUID tokenId) {
        NotificationDeviceToken token = notificationDeviceTokenRepository.findById(tokenId)
                .orElseThrow(() -> new NotFoundException("NotificationDeviceToken_", tokenId));

        if (!token.getUserId().equals(userId)) {
            throw new ForbiddenException("You cannot manage this notification device");
        }

        token.deactivate();

        log.info("Notification device deactivated tokenId={} userId={}", tokenId, userId);
    }

    /**
     * Archives old notification recipient rows based on the retention policy.
     */
    @Transactional
    public int archiveOldNotifications() {
        Instant now = Instant.now();
        Instant readCutoff = now.minus(READ_NOTIFICATION_RETENTION);
        Instant unreadCutoff = now.minus(UNREAD_NOTIFICATION_RETENTION);

        List<NotificationRecipient> readRecipients =
                notificationRecipientRepository.findReadBeforeForArchival(readCutoff);
        List<NotificationRecipient> unreadRecipients =
                notificationRecipientRepository.findUnreadBeforeForArchival(unreadCutoff);

        readRecipients.forEach(recipient -> recipient.archive(now));
        unreadRecipients.forEach(recipient -> recipient.archive(now));

        int archivedCount = readRecipients.size() + unreadRecipients.size();

        log.info(
                "Notification cleanup archived count={} readCount={} unreadCount={}",
                archivedCount,
                readRecipients.size(),
                unreadRecipients.size());

        return archivedCount;
    }

    private NotificationRecipient getUserRecipient(UUID userId, UUID recipientId) {
        return notificationRecipientRepository.findRecipientForUser(recipientId, userId)
                .orElseThrow(() -> new NotFoundException("NotificationRecipient_", recipientId));
    }
}
