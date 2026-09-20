package com.khatiyan.d_modules.servicebalance.model;

/**
 * What happened when a service asked to spend.
 *
 * <p>The caller needs to know whether the price was held or is going on the
 * tab, because the two are settled differently when the work finishes.
 */
public record ServiceSpendOutcome(long pricePaise, boolean reserved) {

    /** The price is held on the balance while the work runs. */
    public static ServiceSpendOutcome held(long pricePaise) {
        return new ServiceSpendOutcome(pricePaise, true);
    }

    /**
     * Nothing was held, because there was nothing to hold.
     *
     * <p>The work still runs. A manager must not be stranded mid-onboarding by
     * an empty balance, so the cost waits as dues and comes out of the next
     * top-up.
     */
    public static ServiceSpendOutcome onTheTab(long pricePaise) {
        return new ServiceSpendOutcome(pricePaise, false);
    }
}
