package com.khatiyan.d_modules.notification.model;

/**
 * Display and delivery importance for a notification.
 *
 * <p>Priority should stay product-facing. Provider-specific priority mapping
 * belongs in the push delivery adapter.
 */
public enum NotificationPriority {
    LOW,
    NORMAL,
    HIGH,
    URGENT
}
