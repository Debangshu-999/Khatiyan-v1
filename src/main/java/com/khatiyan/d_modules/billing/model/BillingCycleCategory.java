package com.khatiyan.d_modules.billing.model;

/**
 * Internal kind of a billing bill.
 *
 * <ul>
 *   <li>{@code RENT_CYCLE} — a numbered monthly/daily rent cycle;</li>
 *   <li>{@code ONE_OFF} — an ad-hoc bill that is not part of the rent sequence
 *       (e.g. an early-exit penalty raised after the current bill was paid). It
 *       carries no cycle number and is ignored by the monthly scheduler.</li>
 * </ul>
 */
public enum BillingCycleCategory {
    RENT_CYCLE,
    ONE_OFF
}
