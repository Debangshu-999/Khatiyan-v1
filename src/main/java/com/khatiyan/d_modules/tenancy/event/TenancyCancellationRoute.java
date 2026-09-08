package com.khatiyan.d_modules.tenancy.event;

/**
 * How a {@code PENDING_ACCEPTANCE} tenancy came to be cancelled.
 *
 * <p>
 * On the event because the notification has to say it. "Your tenancy was
 * cancelled" is the same sentence for all three, and it is wrong twice: an
 * expiry read as a cancellation invites the owner to blame the tenant for
 * something nobody did, and a withdrawal read as a decline blames the tenant
 * for the owner's own decision.
 *
 * <p>
 * Not derived from whether an actor is present. A system expiry and an owner
 * withdrawal both leave the tenant with nothing they chose, but only one of
 * them is somebody's decision, and the difference is the whole message.
 */
public enum TenancyCancellationRoute {

    /** The tenant declined the agreement they were sent. */
    TENANT_DECLINED,

    /** The owner or a manager withdrew the offer before it was accepted. */
    MANAGEMENT_WITHDREW,

    /** Nobody acted. The acceptance window ran out. */
    ACCEPTANCE_EXPIRED
}
