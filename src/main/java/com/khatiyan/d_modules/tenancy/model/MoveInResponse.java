package com.khatiyan.d_modules.tenancy.model;

/**
 * What the tenant said about their move-in checklist (2026-10-29). Persisted
 * by name. Never delete a constant.
 */
public enum MoveInResponse {
    /** Not answered yet. After 48 hours it reads as accepted. */
    PENDING,
    /** "Looks right". */
    ACCEPTED,
    /** They wrote down a difference. */
    NOTED
}
