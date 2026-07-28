package com.khatiyan.d_modules.compliance.model;

/**
 * The machine-readable rule a SYSTEM clause carries. Each type has its own
 * structured value shape (stored in {@link AgreementClause#getValue()}), e.g.
 * {@code RENT}/{@code LATE_FEE} carry a paise amount, {@code NOTICE_PERIOD}/
 * {@code GRACE_DAYS} carry a day count, {@code LOCK_IN} carries a term in months
 * plus an early-exit penalty, {@code DAMAGE_CATALOG} carries an item list, and
 * {@code EXIT_PREREQUISITES} carries a checklist.
 */
public enum SystemClauseType {
    RENT,
    SECURITY_DEPOSIT,
    NOTICE_PERIOD,
    LOCK_IN,
    GRACE_DAYS,
    LATE_FEE,
    // Dropped from authoring (2026-07-12): a fixed cleaning fee reads better as
    // a custom clause. Retained only so settings rows seeded before the drop
    // still deserialize; never seeded or assembled into agreements.
    CLEANING_FEE,
    ALLOWED_DEDUCTIONS,
    DAMAGE_CATALOG,
    EXIT_PREREQUISITES
}
