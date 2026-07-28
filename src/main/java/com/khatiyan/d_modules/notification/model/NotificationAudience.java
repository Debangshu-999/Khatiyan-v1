package com.khatiyan.d_modules.notification.model;

/**
 * Which workspace a notification belongs to for an account that holds more than
 * one role (e.g. a person who is both a tenant and a manager).
 *
 * <p>The in-app feed is scoped by the active account: a tenant only sees
 * {@code TENANT} notifications, a manager/owner only sees {@code MANAGEMENT}
 * notifications. A {@code null} audience on a recipient row means "show in
 * either workspace" — used for account-level/security notifications and for
 * legacy rows created before this dimension existed.
 */
public enum NotificationAudience {
    TENANT,
    MANAGEMENT;

    /**
     * The inherent audience of a subtype, used when the dispatching listener
     * does not specify one explicitly. Returns {@code null} when the subtype is
     * either account-level (auth) or dual-audience (tenancy lifecycle, which is
     * sent to both the tenant and the property's managers) — in those cases the
     * caller supplies the audience per recipient group, or null = both.
     */
    public static NotificationAudience forSubtype(NotificationSubtype subtype) {
        if (subtype == null) {
            return null;
        }
        return switch (subtype) {
            case CONCERN_RAISED, CONCERN_ASSIGNED, CONCERN_REOPENED,
                    TENANCY_EXIT_REQUESTED, TENANCY_EXIT_CANCELLED,
                    MANAGER_ASSIGNED, MANAGER_REMOVED,
                    ROOM_MAINTENANCE_STARTED, ROOM_MAINTENANCE_ENDED,
                    ROOM_DEACTIVATED, ROOM_REACTIVATED,
                    STAFF_ADDED, STAFF_REMOVED,
                    BUDGET_UPDATED, BUDGET_RAISED,
                    BUDGET_APPROACHING, BUDGET_EXCEEDED,
                    PAYOUT_FAILED -> MANAGEMENT;
            case CONCERN_UNDER_REVIEW, CONCERN_IN_PROGRESS, CONCERN_RELEASED,
                    CONCERN_RESOLVED, TENANCY_EXIT_APPROVED, TENANCY_EXIT_REJECTED,
                    TENANCY_EXIT_EXECUTED, NOTICE_PUBLISHED, BILLING_CYCLE_GENERATED,
                    BILLING_LATE_FEE_APPLIED, BILLING_LINE_ITEM_CHANGED,
                    PAYMENT_SUCCEEDED, PAYMENT_FAILED -> TENANT;
            case USER_REGISTERED, PIN_CHANGED,
                    TENANCY_STARTED, TENANCY_ENDED, TENANCY_ROOM_TRANSFERRED,
                    MANAGER_EMPLOYMENT_UPDATED -> null;
        };
    }
}
