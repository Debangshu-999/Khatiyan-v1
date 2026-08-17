package com.khatiyan.d_modules.notification.model;

/**
 * Describes how a notification should be delivered.
 *
 * <p>Push rows are created only when the event is important enough to interrupt
 * the user outside the app.
 */
public enum NotificationDeliveryMode {
    IN_APP_ONLY(false, true),
    IN_APP_AND_PUSH(true, true),

    /**
     * Push the user, but keep the row out of the notification queue.
     *
     * <p>For events that own a screen elsewhere and would otherwise be read
     * twice, in two places, with two read states — currently nudges, which live
     * in their own module and are read from their own screen.
     *
     * <p>Implemented by archiving the recipient row as it is created. Every feed
     * and unread-count query already filters {@code archivedAt IS NULL}, so the
     * row is invisible to all of them without a category exclusion threaded
     * through each one; push delivery reads the push table and is unaffected.
     */
    PUSH_ONLY(true, false);

    private final boolean pushEnabled;
    private final boolean inAppVisible;

    NotificationDeliveryMode(boolean pushEnabled, boolean inAppVisible) {
        this.pushEnabled = pushEnabled;
        this.inAppVisible = inAppVisible;
    }

    public boolean isPushEnabled() {
        return pushEnabled;
    }

    /** False when the row exists only to carry a push. */
    public boolean isInAppVisible() {
        return inAppVisible;
    }
}
