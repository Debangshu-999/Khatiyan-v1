package com.khatiyan.d_modules.compliance.model;

/**
 * Lifecycle of a per-tenancy agreement instance.
 *
 * <p>{@code DRAFT} is reserved for owner authoring before onboarding is
 * finalized; the current flow creates agreements directly in
 * {@code PENDING_ACCEPTANCE}. Once {@code ACCEPTED} the row is immutable and is
 * the legal snapshot. {@code CANCELLED} covers a pending tenancy that expired
 * or was cancelled before the tenant accepted.
 */
public enum AgreementStatus {
    DRAFT,
    PENDING_ACCEPTANCE,
    ACCEPTED,
    CANCELLED
}
