package com.khatiyan.d_modules.notification.model;

/**
 * Durable push delivery lifecycle used by the scheduler.
 */
public enum PushNotificationStatus {
    PENDING,
    IN_PROGRESS,
    DELIVERED,
    FAILED,
    SKIPPED_NO_DEVICE
}