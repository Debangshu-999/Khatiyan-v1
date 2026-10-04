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
                    PAYOUT_FAILED,
                    // A tenant asking to undo an approved exit is a decision the
                    // owner has to make, so it lands in their workspace.
                    TENANCY_EXIT_WITHDRAWAL_REQUESTED,
                    // A tenant asking to move rooms is a decision the owner
                    // makes, so it lands in their workspace — same shape as
                    // an exit request.
                    TENANCY_ROOM_CHANGE_REQUESTED,
                    // Someone asking about the property is the owner's to answer.
                    ENQUIRY_RECEIVED,
                    // Being given an enquiry to handle, and the owner's daily
                    // reminder that some still wait for a handler.
                    ENQUIRY_ASSIGNED, ENQUIRY_UNASSIGNED,
                    // The enquirer wrote back on the chat the handler was
                    // waiting on. The handler's to read, in their workspace.
                    ENQUIRY_CHAT_REPLIED,
                    // The enquirer is interested again: the handler's to act on.
                    ENQUIRY_MIND_CHANGED,
                    // Who is coming today and in the next slot, who is running
                    // late, and whose attendance was not marked: the owner's
                    // and every manager's, who receive visitors (2026-10-04).
                    VISITORS_TODAY, VISIT_SLOT_STARTING, VISITOR_RUNNING_LATE, VISIT_ATTENDANCE_NOT_MARKED,
                    // A tenant claiming they paid is a decision the owner has to
                    // make against their bank statement.
                    PAYMENT_CLAIM_RAISED,
                    // A booked stay waiting on a bed only the owner can free.
                    FUTURE_BOOKING_BLOCKED -> MANAGEMENT;
            case CONCERN_UNDER_REVIEW, CONCERN_IN_PROGRESS, CONCERN_RELEASED,
                    CONCERN_RESOLVED, TENANCY_EXIT_APPROVED, TENANCY_EXIT_REJECTED,
                    TENANCY_EXIT_EXECUTED, NOTICE_PUBLISHED, BILLING_CYCLE_GENERATED,
                    BILLING_CYCLE_CANCELLED,
                    BILLING_LATE_FEE_APPLIED, BILLING_LINE_ITEM_CHANGED,
                    PAYMENT_SUCCEEDED, PAYMENT_FAILED,
                    // The owner could not find their payment — the tenant's
                    // answer to "has my rent gone through".
                    PAYMENT_CLAIM_REJECTED,
                    // The outcome of a withdrawal is the tenant's answer to "am I
                    // still leaving", so it belongs in their workspace.
                    TENANCY_EXIT_WITHDRAWAL_APPROVED, TENANCY_EXIT_WITHDRAWAL_REJECTED,
                    // The decision on their own request is the tenant's answer
                    // to "am I moving", so it belongs in their workspace.
                    TENANCY_ROOM_CHANGE_APPROVED, TENANCY_ROOM_CHANGE_REJECTED,
                    // Nudges are sent to the tenant. The audience never reaches a
                    // feed — the row is archived on creation — but it is set so
                    // nothing infers "both workspaces" from a null.
                    NUDGE_RECEIVED,
                    // The answer to their own enquiry. The enquirer is usually
                    // not a tenant yet, but TENANT is the non-management
                    // workspace and that is where they are reading.
                    ENQUIRY_ANSWERED,
                    // Their enquiry was closed: theirs to read, like the answer.
                    ENQUIRY_CLOSED,
                    // Reminders of the visit they booked (2026-10-04).
                    VISIT_REMINDER_DAY_BEFORE, VISIT_REMINDER_TODAY,
                    // A meal on the tenant's plan moved. Only tenants on a meal
                    // plan are told, and they read it in their stay.
                    FOOD_MEAL_DELAYED -> TENANT;
            // Account-level, like the other auth subtypes: a sign-in belongs to
            // the PERSON, not to a property workspace. Someone with both an
            // owner and a tenant account must see it in whichever they are in.
            case
                    // Dual-audience: a conversation has a side, and the push goes
                    // to whichever one did not send. The caller names the audience
                    // per recipient group.
                    CHAT_MESSAGE_RECEIVED,
                    // Dual-audience: a visit is booked or moved by one side and
                    // the other is told. The caller names the audience.
                    VISIT_SCHEDULED, VISIT_RESCHEDULED, VISIT_CANCELLED,
                    // A check-in is told to the visitor and to the property alike.
                    VISIT_CHECKED_IN,
                    USER_REGISTERED, PIN_CHANGED, NEW_DEVICE_SIGNED_IN,
                    TENANT_ONBOARDED, TENANCY_STARTED, TENANCY_ENDED, TENANCY_ROOM_TRANSFERRED,
                    // Dual-audience by definition: whichever side did NOT
                    // cancel is the side that needs telling, and all three
                    // routes have a different one. The listener names the
                    // audience per recipient group.
                    TENANCY_CANCELLED,
                    // Dual-audience: the tenant needs to know they have moved
                    // and what their rent becomes; the owner needs the bed
                    // change reflected in their workspace.
                    TENANCY_ROOM_CHANGE_EXECUTED,
                    // Dual-audience: a room change that could not run is
                    // cancelled, and both sides need to know. The tenant hears
                    // what it means for them, management hears why. The listener
                    // names the audience per recipient group.
                    TENANCY_ROOM_CHANGE_EXECUTION_FAILED,
                    // Account-level: it goes to someone whose stay is still
                    // pending, who is not a tenant yet and has no tenant
                    // workspace to read it in (owner's call, 2026-09-27).
                    VERIFICATION_ATTEMPTS_ADDED,
                    // Dual-audience: the tenant hears their stay reached its end
                    // date, management hears it is waiting to be ended. The
                    // listener names the audience per recipient group.
                    TENANCY_PENDING_EXIT,
                    // Scheduled exits were removed on 2026-09-12. Nothing sends
                    // this any more, but stored notifications still carry it.
                    TENANCY_EXIT_SCHEDULE_FAILED,
                    MANAGER_EMPLOYMENT_UPDATED,
                    // Both sides need to know a request lapsed unreviewed: the
                    // tenant so they can re-raise without losing notice time, the
                    // owner because letting it lapse was a management failure.
                    TENANCY_EXIT_EXPIRED,
                    // Both sides need the run-up to a term ending: the tenant so
                    // they can leave on the one day that costs no penalty, the
                    // owner so they can plan the bed either way.
                    TENANCY_AGREEMENT_EXPIRY_APPROACHING -> null;
        };
    }
}
