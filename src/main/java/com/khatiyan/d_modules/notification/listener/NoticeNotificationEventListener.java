package com.khatiyan.d_modules.notification.listener;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.modulith.events.ApplicationModuleListener;

import com.khatiyan.d_modules.notice.event.NoticePublishedEvent;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.tenancy.TenancyModule;

/**
 * Converts immediately visible notice publication events into tenant
 * notifications.
 */
@Component
public class NoticeNotificationEventListener {

    private final NotificationModule notificationModule;
    private final TenancyModule tenancyModule;
    private final PropertyModule propertyModule;

    public NoticeNotificationEventListener(
            NotificationModule notificationModule,
            TenancyModule tenancyModule,
            PropertyModule propertyModule) {
        this.notificationModule = notificationModule;
        this.tenancyModule = tenancyModule;
        this.propertyModule = propertyModule;
    }

    @ApplicationModuleListener
    public void onNoticePublished(NoticePublishedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        List<UUID> tenantUserIds = tenancyModule.findActiveByPropertyId(event.propertyId())
                .stream()
                .map(tenancy -> tenancy.userId())
                .distinct()
                .toList();

        Map<String, String> data = new LinkedHashMap<>();
        data.put("noticeId", event.noticeId().toString());
        data.put("propertyId", event.propertyId().toString());
        data.put("propertyName", property.name());
        if (event.title() != null) {
            data.put("noticeTitle", event.title());
        }

        notificationModule.notifyUsers(
                tenantUserIds,
                "New notice",
                event.title(),
                NotificationCategory.NOTICE,
                NotificationPriority.NORMAL,
                NotificationSubtype.NOTICE_PUBLISHED,
                event.noticeId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }
}
