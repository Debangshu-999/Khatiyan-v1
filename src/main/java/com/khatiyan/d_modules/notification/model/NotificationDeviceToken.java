package com.khatiyan.d_modules.notification.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "notification_device_tokens", schema = "notification")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NotificationDeviceToken extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PushProvider provider;

    @Column(name = "provider_token", nullable = false, length = 500)
    private String providerToken;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DevicePlatform platform;

    @Column(nullable = false)
    private boolean active;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    private NotificationDeviceToken(UUID userId, PushProvider provider,
            String providerToken, DevicePlatform platform, Instant now) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.provider = provider;
        this.providerToken = providerToken;
        this.platform = platform;
        this.active = true;
        this.lastSeenAt = now;
    }

    public static NotificationDeviceToken register(UUID userId, PushProvider provider,
            String providerToken, DevicePlatform platform, Instant now) {
        return new NotificationDeviceToken(userId, provider, providerToken, platform, now);
    }

    public void refresh(DevicePlatform platform, Instant now) {
        this.platform = platform;
        this.active = true;
        this.lastSeenAt = now;
    }

    public void refreshForUser(UUID userId, DevicePlatform platform, Instant now) {
        this.userId = userId;
        this.platform = platform;
        this.active = true;
        this.lastSeenAt = now;
    }

    public void deactivate() {
        this.active = false;
    }
}
