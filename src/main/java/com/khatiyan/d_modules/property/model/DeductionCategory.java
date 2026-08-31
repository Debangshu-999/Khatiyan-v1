package com.khatiyan.d_modules.property.model;

/**
 * What a security deposit may lawfully be used for at move-out.
 *
 * <p>Owned by the property, alongside the damage-charge schedule and the move-out
 * checklist, because all three answer the same question — what happens when a
 * tenant leaves — and splitting them across two modules meant an owner set half
 * their exit policy on one screen and half on another.
 *
 * <p>Previously a per-tenancy negotiable value stored inside the agreement's
 * clause. It is not negotiable: it is the property's stated policy, and letting
 * it vary per tenant produced deeds at one address that disagreed about what a
 * deposit covers.
 *
 * <p>The labels are printed verbatim into the deed's deposit clause, which is why
 * they read as sentence fragments rather than as UI captions.
 */
public enum DeductionCategory {

    DAMAGE("Verified damage to the Premises or its contents, beyond normal wear and tear"),
    UNPAID_DUES("Unpaid rent, bills and other dues"),
    CLEANING("Cleaning and repainting beyond normal wear and tear"),
    UTILITIES("Unpaid electricity, water and other utility charges");

    private final String label;

    DeductionCategory(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
