package com.khatiyan.d_modules.notification.listener;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.notice.event.NoticePublishedEvent;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.tenancy.TenancyModule;

/**
 * Converts immediately visible notice publication events into tenant
 * notifications.
 */
@Component
public class NoticeNotificationEventListener {

    private final NotificationModule notificationModule;
    private final TenancyModule tenancyModule;

    public NoticeNotificationEventListener(
            NotificationModule notificationModule,
            TenancyModule tenancyModule) {
        this.notificationModule = notificationModule;
        this.tenancyModule = tenancyModule;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onNoticePublished(NoticePublishedEvent event) {
        List<UUID> tenantUserIds = tenancyModule.findActiveByPropertyId(event.propertyId())
                .stream()
                .map(tenancy -> tenancy.userId())
                .distinct()
                .toList();

        notificationModule.notifyUsers(
                tenantUserIds,
                "New notice",
                event.title(),
                NotificationCategory.NOTICE,
                NotificationPriority.NORMAL,
                event.noticeId(),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }
}
