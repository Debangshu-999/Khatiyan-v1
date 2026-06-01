package com.khatiyan.d_modules.billing.event;

/**
 * User-facing billing line change that can become an in-app/push notification.
 */
public enum BillingLineItemNotificationAction {
    CREATED,
    ADJUSTED,
    CLEARED,
    MOVED_TO_DEPOSIT,
    MOVED_TO_BILL
}
