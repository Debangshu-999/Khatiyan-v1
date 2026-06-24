package com.khatiyan.d_modules.notification.service;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
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
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationDeviceToken;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationRecipient;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.notification.model.PushNotification;
import com.khatiyan.d_modules.notification.repository.NotificationDeviceTokenRepository;
import com.khatiyan.d_modules.notification.repository.NotificationRecipientRepository;
import com.khatiyan.d_modules.notification.repository.NotificationRepository;
import com.khatiyan.d_modules.notification.repository.PushNotificationRepository;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

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
    private static final Duration RECENT_BUCKET = Duration.ofDays(7);
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final String ROLE_OWNER = "OWNER";
    private static final String ACCOUNT_TENANT = "tenant";
    private static final String ACCOUNT_MANAGER = "manager";
    private static final String ACCOUNT_OWNER = "owner";

    private final NotificationRepository notificationRepository;
    private final NotificationRecipientRepository notificationRecipientRepository;
    private final PushNotificationRepository pushNotificationRepository;
    private final NotificationDeviceTokenRepository notificationDeviceTokenRepository;
    private final TenancyModule tenancyModule;

    public NotificationService(
            NotificationRepository notificationRepository,
            NotificationRecipientRepository notificationRecipientRepository,
            PushNotificationRepository pushNotificationRepository,
            NotificationDeviceTokenRepository notificationDeviceTokenRepository,
            TenancyModule tenancyModule) {
        this.notificationRepository = notificationRepository;
        this.notificationRecipientRepository = notificationRecipientRepository;
        this.pushNotificationRepository = pushNotificationRepository;
        this.notificationDeviceTokenRepository = notificationDeviceTokenRepository;
        this.tenancyModule = tenancyModule;
    }

    /**
     * Creates one notification for one user (legacy signature — no subtype or
     * structured data; used by reminder pipeline).
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
        createNotification(List.of(userId), title, body, category, priority, null, sourceId, Map.of(), deliveryMode, null);
    }

    /**
     * Legacy signature with an explicit audience — used by the reminder pipeline
     * so scheduled reminders land in the correct workspace.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void notifyUser(
            UUID userId,
            String title,
            String body,
            NotificationCategory category,
            NotificationPriority priority,
            UUID sourceId,
            NotificationDeliveryMode deliveryMode,
            NotificationAudience audience) {
        createNotification(List.of(userId), title, body, category, priority, null, sourceId, Map.of(), deliveryMode, audience);
    }

    /**
     * Creates one shared notification and one recipient/push row per user
     * (legacy signature).
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
        createNotification(userIds, title, body, category, priority, null, sourceId, Map.of(), deliveryMode, null);
    }

    /**
     * Full signature with subtype and structured data — used by event
     * listeners that produce richly-contextual notifications.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void notifyUser(
            UUID userId,
            String title,
            String body,
            NotificationCategory category,
            NotificationPriority priority,
            NotificationSubtype subtype,
            UUID sourceId,
            Map<String, String> data,
            NotificationDeliveryMode deliveryMode) {
        createNotification(List.of(userId), title, body, category, priority, subtype, sourceId, data, deliveryMode, null);
    }

    /**
     * Full signature with subtype and structured data for multi-recipient
     * fan-out.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void notifyUsers(
            Collection<UUID> userIds,
            String title,
            String body,
            NotificationCategory category,
            NotificationPriority priority,
            NotificationSubtype subtype,
            UUID sourceId,
            Map<String, String> data,
            NotificationDeliveryMode deliveryMode) {
        createNotification(userIds, title, body, category, priority, subtype, sourceId, data, deliveryMode, null);
    }

    /**
     * Structured fan-out with an explicit audience — used by dispatchers that
     * send the same subtype to both tenants and management (e.g. tenancy
     * lifecycle), where the subtype alone can't decide the workspace.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void notifyUser(
            UUID userId,
            String title,
            String body,
            NotificationCategory category,
            NotificationPriority priority,
            NotificationSubtype subtype,
            UUID sourceId,
            Map<String, String> data,
            NotificationDeliveryMode deliveryMode,
            NotificationAudience audience) {
        createNotification(List.of(userId), title, body, category, priority, subtype, sourceId, data, deliveryMode, audience);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void notifyUsers(
            Collection<UUID> userIds,
            String title,
            String body,
            NotificationCategory category,
            NotificationPriority priority,
            NotificationSubtype subtype,
            UUID sourceId,
            Map<String, String> data,
            NotificationDeliveryMode deliveryMode,
            NotificationAudience audience) {
        createNotification(userIds, title, body, category, priority, subtype, sourceId, data, deliveryMode, audience);
    }

    private void createNotification(
            Collection<UUID> userIds,
            String title,
            String body,
            NotificationCategory category,
            NotificationPriority priority,
            NotificationSubtype subtype,
            UUID sourceId,
            Map<String, String> data,
            NotificationDeliveryMode deliveryMode,
            NotificationAudience audienceOverride) {
        if (userIds == null || userIds.isEmpty()) {
            log.debug("Notification skipped because recipient list is empty category={} sourceId={}", category, sourceId);
            return;
        }
        NotificationDeliveryMode resolvedDeliveryMode =
                deliveryMode == null ? NotificationDeliveryMode.IN_APP_ONLY : deliveryMode;
        // Explicit audience wins; otherwise infer the workspace from the subtype.
        NotificationAudience audience =
                audienceOverride != null ? audienceOverride : NotificationAudience.forSubtype(subtype);

        Instant now = Instant.now();
        Notification notification = Notification.create(title, body, category, priority, subtype, sourceId, data);
        Notification savedNotification = notificationRepository.save(notification);

        List<NotificationRecipient> recipients = userIds.stream()
                .distinct()
                .map(userId -> NotificationRecipient.create(savedNotification, userId, audience))
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
     * Tenancy-scoped recent feed (last 7 days). For users with an active
     * tenancy, only notifications created on/after the tenancy start are
     * returned, so notifications from past tenancies stay out. For OWNERs,
     * all of their notifications in the last 7 days are returned. For USERs
     * without an active tenancy, returns an empty list.
     */
    @Transactional(readOnly = true)
    public List<NotificationResponse> listMyRecentNotifications(UUID userId, String account, String role) {
        Optional<Instant> floor = resolveScopeFloor(userId, account, role);
        if (floor.isEmpty()) {
            return List.of();
        }

        Instant recentBoundary = Instant.now().minus(RECENT_BUCKET);
        Instant since = floor.get().isAfter(recentBoundary) ? floor.get() : recentBoundary;
        NotificationAudience audience = audienceForAccount(account);

        List<NotificationRecipient> rows = audience == null
                ? notificationRecipientRepository.findVisibleByUserIdSince(userId, since)
                : notificationRecipientRepository.findVisibleByUserIdSinceAndAudience(userId, since, audience);
        return rows.stream().map(NotificationResponse::from).toList();
    }

    /**
     * Tenancy-scoped older feed (older than 7 days, still within the current
     * tenancy window for USERs). Used by the "older notifications" screen.
     */
    @Transactional(readOnly = true)
    public List<NotificationResponse> listMyOlderNotifications(UUID userId, String account, String role) {
        Optional<Instant> floor = resolveScopeFloor(userId, account, role);
        if (floor.isEmpty()) {
            return List.of();
        }

        Instant recentBoundary = Instant.now().minus(RECENT_BUCKET);
        if (!floor.get().isBefore(recentBoundary)) {
            // The whole tenancy window is inside the last 7 days — no older bucket.
            return List.of();
        }

        NotificationAudience audience = audienceForAccount(account);
        List<NotificationRecipient> rows = audience == null
                ? notificationRecipientRepository.findVisibleByUserIdBetween(userId, floor.get(), recentBoundary)
                : notificationRecipientRepository.findVisibleByUserIdBetweenAndAudience(userId, floor.get(), recentBoundary, audience);
        return rows.stream().map(NotificationResponse::from).toList();
    }

    /**
     * Tenancy-scoped unread count for the bell badge — counts unread visible
     * notifications in the current scope across both recent and older buckets.
     */
    @Transactional(readOnly = true)
    public long countMyCurrentUnreadNotifications(UUID userId, String account, String role) {
        Optional<Instant> floor = resolveScopeFloor(userId, account, role);
        if (floor.isEmpty()) {
            return 0L;
        }
        NotificationAudience audience = audienceForAccount(account);
        return audience == null
                ? notificationRecipientRepository.countUnreadByUserIdSince(userId, floor.get())
                : notificationRecipientRepository.countUnreadByUserIdSinceAndAudience(userId, floor.get(), audience);
    }

    /**
     * Resolves the "since" floor for the current notification scope.
     *
     * <ul>
     *   <li>OWNER -> {@link Instant#EPOCH} (no floor, see everything).</li>
     *   <li>USER with active tenancy -> start-of-day in IST on the tenancy
     *       start date.</li>
     *   <li>USER without active tenancy -> empty (caller returns empty feed).</li>
     * </ul>
     */
    private NotificationAudience audienceForAccount(String account) {
        if (account == null || account.isBlank()) {
            return null;
        }
        return ACCOUNT_TENANT.equalsIgnoreCase(account) ? NotificationAudience.TENANT : NotificationAudience.MANAGEMENT;
    }

    private Optional<Instant> resolveScopeFloor(UUID userId, String account, String role) {
        // Management workspaces see all-time; the tenant workspace is scoped to
        // the current tenancy window. When no account is supplied we fall back
        // to the JWT role for backward compatibility.
        boolean management = ACCOUNT_MANAGER.equalsIgnoreCase(account)
                || ACCOUNT_OWNER.equalsIgnoreCase(account)
                || (account == null && ROLE_OWNER.equalsIgnoreCase(role));
        if (management) {
            return Optional.of(Instant.EPOCH);
        }

        return tenancyModule.findActiveByUserId(userId)
                .map(TenancyResponse::startDate)
                .map(startDate -> startDate.atStartOfDay(IST).toInstant())
                .or(() -> Optional.of(Instant.EPOCH));
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
    public void markAllRead(UUID userId, String account) {
        Instant now = Instant.now();

        NotificationAudience audience = audienceForAccount(account);
        List<NotificationRecipient> recipients = audience == null
                ? notificationRecipientRepository.findVisibleByUserId(userId)
                : notificationRecipientRepository.findVisibleByUserIdAndAudience(userId, audience);
        recipients.forEach(recipient -> recipient.markRead(now));

        log.info("All visible notifications marked read userId={} account={} count={}", userId, account, recipients.size());
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
