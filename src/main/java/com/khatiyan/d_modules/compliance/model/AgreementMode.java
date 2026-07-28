package com.khatiyan.d_modules.compliance.model;

/**
 * Whether agreements apply to a property's monthly tenancies.
 *
 * <ul>
 *   <li>{@code OFF} — no agreements; monthly tenancies activate immediately (legacy behaviour).</li>
 *   <li>{@code SELECTIVE} — the owner opts in per tenancy at onboarding.</li>
 *   <li>{@code ALL_MONTHLY} — every monthly tenancy requires an accepted agreement.</li>
 * </ul>
 */
public enum AgreementMode {
    OFF,
    SELECTIVE,
    ALL_MONTHLY
}
