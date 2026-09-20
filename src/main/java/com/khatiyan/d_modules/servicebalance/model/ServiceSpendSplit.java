package com.khatiyan.d_modules.servicebalance.model;

/**
 * How a spend divided between money the owner had and money they now owe.
 *
 * <p>Both halves travel because the ledger row has to carry both deltas. A
 * single net figure would leave a reader unable to tell a charge that was paid
 * for from one that became a debt, which is the difference between a balance
 * going down and an owner's exposure going up.
 */
public record ServiceSpendSplit(long fromAvailablePaise, long toOutstandingPaise) {

    /** What the provider billed us, however it was met. */
    public long totalPaise() {
        return fromAvailablePaise + toOutstandingPaise;
    }

    /** Whether any of this landed as a debt rather than coming out of the balance. */
    public boolean wentOnTheTab() {
        return toOutstandingPaise > 0;
    }
}
