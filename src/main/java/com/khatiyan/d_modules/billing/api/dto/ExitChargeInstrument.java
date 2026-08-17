package com.khatiyan.d_modules.billing.api.dto;

/**
 * How a charge assessed at end-tenancy is actually collected.
 *
 * <p>There are only two, and the choice is always the actor's: nothing at exit
 * is charged automatically.
 */
public enum ExitChargeInstrument {

    /** Deducted from the tenant's deposit, if the remaining balance covers it. */
    DEPOSIT,

    /**
     * Raised as a one-off bill and recorded paid in the same breath — the money
     * changed hands at move-out.
     *
     * <p>The bill is recorded paid rather than left open on purpose. An open bill
     * would leave the tenancy ending while owing money, which is the state the
     * whole exit design exists to prevent: it would trip the clearance rule that
     * guards the next exit, and there is no "closed, dues outstanding" tenancy
     * state for it to land in.
     */
    ONE_OFF_BILL
}
