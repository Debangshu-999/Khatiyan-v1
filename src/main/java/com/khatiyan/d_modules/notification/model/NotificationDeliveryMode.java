package com.khatiyan.d_modules.notification.model;

/**
 * Describes how a notification should be delivered.
 *
 * <p>In-app rows are always created. Push rows are created only when the event
 * is important enough to interrupt the user outside the app.
 */
public enum NotificationDeliveryMode {
    IN_APP_ONLY(false),
    IN_APP_AND_PUSH(true);

    private final boolean pushEnabled;

    NotificationDeliveryMode(boolean pushEnabled) {
        this.pushEnabled = pushEnabled;
    }

    public boolean isPushEnabled() {
        return pushEnabled;
    }
}
