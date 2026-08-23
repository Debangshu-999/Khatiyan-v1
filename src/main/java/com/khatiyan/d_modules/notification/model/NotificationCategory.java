package com.khatiyan.d_modules.notification.model;

/**
 * Product area that produced a notification.
 *
 * <p>The category is used for grouping, filtering, and deciding how the app
 * should present the notification to the user.
 */
public enum NotificationCategory {
    AUTH,
    TENANCY,
    CONCERN,
    NOTICE,
    PROPERTY,
    PAYMENT,
    EXPENSE,
    /**
     * A one-way message management sent to a single tenant. Delivered as push
     * only — the message itself lives in the nudge module and is read from the
     * tenant's own nudges screen, never from the notification queue.
     */
    NUDGE,
    CHAT,
    /** A prospective tenant asking about a property, and the reply to it. */
    ENQUIRY,
    SYSTEM
}
