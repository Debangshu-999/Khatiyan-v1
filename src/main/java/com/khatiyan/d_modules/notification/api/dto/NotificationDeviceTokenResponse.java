package com.khatiyan.d_modules.notification.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.notification.model.DevicePlatform;
import com.khatiyan.d_modules.notification.model.NotificationDeviceToken;
import com.khatiyan.d_modules.notification.model.PushProvider;

/**
 * Registered push token summary for a user device.
 */
public record NotificationDeviceTokenResponse(
    UUID id,
    PushProvider provider,
    DevicePlatform platform,
    boolean active,
    Instant lastSeenAt
) {

    public static NotificationDeviceTokenResponse from(NotificationDeviceToken token) {
        return new NotificationDeviceTokenResponse(
            token.getId(),
            token.getProvider(),
            token.getPlatform(),
            token.isActive(),
            token.getLastSeenAt()
        );
    }
}
