package com.khatiyan.d_modules.notification.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.notification.model.Notification;
import com.khatiyan.d_modules.notification.model.NotificationDeviceToken;
import com.khatiyan.d_modules.notification.model.NotificationRecipient;
import com.khatiyan.d_modules.notification.model.PushNotification;
import com.khatiyan.d_modules.notification.model.PushNotificationCommand;
import com.khatiyan.d_modules.notification.model.PushProvider;
import com.khatiyan.d_modules.notification.model.PushSendResult;
import com.khatiyan.d_modules.notification.repository.NotificationDeviceTokenRepository;
import com.khatiyan.d_modules.notification.repository.PushNotificationRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Coordinates durable push delivery.
 *
 * <p>
 * Claiming is done in a short transaction using row locks. External provider
 * calls happen after the claim transaction has committed, then each row is
 * updated in its own transaction.
 */
@Slf4j
@Service
public class PushDeliveryService {

    private static final Duration STALE_IN_PROGRESS_TIMEOUT = Duration.ofMinutes(5);
    private static final Duration RETRY_DELAY = Duration.ofMinutes(5);
    private static final int MAX_ATTEMPTS = 5;

    private final PushNotificationRepository pushNotificationRepository;
    private final NotificationDeviceTokenRepository notificationDeviceTokenRepository;
    private final Map<PushProvider, PushNotificationProvider> providers;
    private final TransactionTemplate transactionTemplate;

    public PushDeliveryService(
            PushNotificationRepository pushNotificationRepository,
            NotificationDeviceTokenRepository notificationDeviceTokenRepository,
            List<PushNotificationProvider> providers,
            PlatformTransactionManager transactionManager) {

        this.pushNotificationRepository = pushNotificationRepository;
        this.notificationDeviceTokenRepository = notificationDeviceTokenRepository;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.providers = new EnumMap<>(PushProvider.class);
        providers.forEach(provider -> this.providers.put(provider.provider(), provider));
    }

    /**
     * Claims due push jobs and attempts delivery for each claimed row.
     */
    public int deliverDuePushNotifications(int batchSize) {
        List<UUID> claimedIds = transactionTemplate.execute(status -> claimDuePushNotifications(batchSize));

        if (claimedIds == null) {
            return 0;
        }

        claimedIds.forEach(pushNotificationId ->
                transactionTemplate.executeWithoutResult(status -> deliverOne(pushNotificationId)));

        return claimedIds.size();
    }

    /**
     * Claims pending and stale in-progress rows without holding locks during
     * external provider calls.
     */
    private List<UUID> claimDuePushNotifications(int batchSize) {
        Instant now = Instant.now();
        Instant staleBefore = now.minus(STALE_IN_PROGRESS_TIMEOUT);

        List<PushNotification> pushNotifications = pushNotificationRepository.findClaimableForUpdate(
                now,
                staleBefore,
                batchSize);

        pushNotifications.forEach(pushNotification -> pushNotification.markInProgress(now));

        if (!pushNotifications.isEmpty()) {
            log.info("Push notifications claimed count={}", pushNotifications.size());
        }

        return pushNotifications.stream()
                .map(pushNotification -> pushNotification.getId())
                .toList();
    }

    /**
     * Sends one claimed push job and stores its final or retry state.
     */
    private void deliverOne(UUID pushNotificationId) {
        Instant now = Instant.now();
        PushNotification pushNotification = pushNotificationRepository
                .findPushNotificationById(pushNotificationId)
                .orElseThrow(() -> new NotFoundException("PushNotification_", pushNotificationId));

        List<NotificationDeviceToken> tokens = notificationDeviceTokenRepository
                .findActiveByUserId(pushNotification.getUserId());

                
        if (tokens.isEmpty()) {
            pushNotification.markSkippedNoDevice(now);
            log.info(
                    "Push notification skipped no active device pushNotificationId={} userId={}",
                    pushNotificationId,
                    pushNotification.getUserId());
            return;
        }

        List<PushProvider> deliveryOrder = List.of(PushProvider.ONESIGNAL, PushProvider.FIREBASE, PushProvider.LOG);
        String lastFailureReason = "No supported push provider token found";

        for (PushProvider provider : deliveryOrder) {
            List<String> providerTokens = tokens.stream()
                    .filter(token -> token.getProvider() == provider)
                    .map(token -> token.getProviderToken())
                    .distinct()
                    .toList();

            if (providerTokens.isEmpty()) {
                continue;
            }

            PushNotificationProvider pushProvider = providers.get(provider);
            if (pushProvider == null) {
                lastFailureReason = "Push provider is not configured: " + provider;
                continue;
            }

            pushNotification.markAttempted(provider, now);
            PushSendResult result = pushProvider.send(toCommand(pushNotification, providerTokens));

            if (result.delivered()) {
                pushNotification.markDelivered(provider, Instant.now());
                return;
            }

            lastFailureReason = result.failureReason();

            if (!result.retryable()) {
                pushNotification.markFailed(lastFailureReason);
                return;
            }
        }

        if (pushNotification.getAttemptCount() >= MAX_ATTEMPTS) {
            pushNotification.markFailed(lastFailureReason);
            return;
        }

        pushNotification.markRetryableFailure(lastFailureReason, Instant.now().plus(RETRY_DELAY));
    }

    private PushNotificationCommand toCommand(PushNotification pushNotification, List<String> providerTokens) {
        NotificationRecipient recipient = pushNotification.getNotificationRecipient();
        Notification notification = recipient.getNotification();

        return new PushNotificationCommand(
                pushNotification.getId(),
                pushNotification.getUserId(),
                notification.getTitle(),
                notification.getBody(),
                notification.getCategory(),
                notification.getPriority(),
                notification.getSourceId(),
                providerTokens.stream()
                        .sorted(Comparator.naturalOrder())
                        .toList());
    }
}
