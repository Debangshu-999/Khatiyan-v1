package com.khatiyan.d_modules.notification.model;

/**
 * Specific event flavour within a {@link NotificationCategory}. The frontend
 * uses this to decide which screen the notification should deep-link into
 * (e.g. CONCERN_RAISED vs CONCERN_RESOLVED open different destinations) and
 * which structured fields to read from the {@code data} payload.
 *
 * <p>Names are stable wire identifiers — when a value is added here, the
 * frontend's switch on subtype gets an extra branch but existing clients
 * fall through to a default presentation.
 */
public enum NotificationSubtype {

    // Auth lifecycle.
    USER_REGISTERED,
    PIN_CHANGED,

    // Tenancy lifecycle.
    TENANCY_STARTED,
    TENANCY_ENDED,
    TENANCY_ROOM_TRANSFERRED,

    // Tenancy exit request workflow.
    TENANCY_EXIT_REQUESTED,
    TENANCY_EXIT_APPROVED,
    TENANCY_EXIT_REJECTED,
    TENANCY_EXIT_CANCELLED,
    TENANCY_EXIT_EXECUTED,

    // Concern (ticket) workflow.
    CONCERN_RAISED,
    CONCERN_ASSIGNED,
    CONCERN_IN_PROGRESS,
    CONCERN_RESOLVED,
    CONCERN_REOPENED,

    // Notice publication.
    NOTICE_PUBLISHED,

    // Property management.
    MANAGER_ASSIGNED,
    MANAGER_REMOVED,

    // Billing cycles + line edits + payment outcomes.
    BILLING_CYCLE_GENERATED,
    BILLING_LATE_FEE_APPLIED,
    BILLING_LINE_ITEM_CHANGED,
    PAYMENT_SUCCEEDED,
    PAYMENT_FAILED,
}
