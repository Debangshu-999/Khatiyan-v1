package com.khatiyan.d_modules.compliance.model;

/**
 * The machine-readable rule a SYSTEM clause carries. Each type has its own
 * structured value shape (stored in {@link AgreementClause#getValue()}), e.g.
 * {@code RENT}/{@code LATE_FEE} carry a paise amount, {@code NOTICE_PERIOD}/
 * {@code GRACE_DAYS} carry a day count, {@code VALIDITY} carries the agreement's lifetime in months (null = indefinite)
 * plus an early-exit penalty, {@code DAMAGE_CATALOG} carries an item list, and
 * {@code EXIT_PREREQUISITES} carries a checklist.
 */
public enum SystemClauseType {
    RENT,
    SECURITY_DEPOSIT,
    NOTICE_PERIOD,
    /** How long the agreement runs, and what leaving early costs. */
    VALIDITY,

    /**
     * Legacy name for {@link #VALIDITY}, kept only so already-signed agreements
     * still deserialize.
     *
     * <p>An accepted agreement is frozen and content-hashed — it is the record of
     * what a tenant actually agreed to, so it can never be rewritten. That makes
     * every enum constant ever persisted into one permanent: removing this broke
     * every screen that loads an agreement signed before the rename.
     *
     * <p>Never emit it. Readers must accept it wherever they accept VALIDITY.
     */
    @Deprecated
    LOCK_IN,
    GRACE_DAYS,
    LATE_FEE,
    // Dropped from authoring (2026-07-12): a fixed cleaning fee reads better as
    // a custom clause. Retained only so settings rows seeded before the drop
    // still deserialize; never seeded or assembled into agreements.
    CLEANING_FEE,
    ALLOWED_DEDUCTIONS,
    DAMAGE_CATALOG,
    EXIT_PREREQUISITES,
    /**
     * What leaving before serving notice costs on an indefinite agreement.
     *
     * <p>The counterpart to VALIDITY's early-exit rule, which only applies to a
     * fixed term. Both are the owner's own words, applied by a person — never a
     * computed penalty.
     */
    PREMATURE_EXIT
}
