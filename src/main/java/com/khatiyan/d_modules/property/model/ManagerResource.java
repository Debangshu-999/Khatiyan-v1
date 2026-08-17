package com.khatiyan.d_modules.property.model;

/**
 * A part of the app an owner can grant a manager access to.
 *
 * <p>
 * Deliberately screen-shaped rather than module-shaped: an owner thinks "can
 * they touch the exit policy" and "can they see the board", not "do they have
 * the property module". Several of these live in the same backend module.
 *
 * <p>
 * Adding a value here is a product decision, not a refactor — it appears in the
 * owner's permission screen and defaults to {@link ManagerAccessLevel#NONE} for
 * every existing manager.
 */
public enum ManagerResource {

    // --- Tenancy ---
    /** Property stays: the active/past list, a tenant's profile, and ending a stay. */
    TENANCIES,
    /** Onboarding a new tenant. Has no meaningful view-only state — you can
     *  either create a tenancy or you cannot — so the UI offers it as on/off. */
    TENANCY_CREATE,
    /** Tenancy agreement AND exit policies together: one decision, because both
     *  are the rules a stay runs under rather than day-to-day work. */
    TENANCY_RULES,
    EXIT_REQUESTS,
    ROOM_CHANGES,

    // --- Billing ---
    BILLING_CYCLES,
    DEPOSITS,

    // --- Money ---
    EXPENSES,
    PNL,

    // --- Property ---
    ROOMS,
    PROPERTY_SETTINGS,
    PROPERTY_BOARD,
    NEARBY_PLACES,

    // --- Operations ---
    NOTICES,
    CONCERNS,

    // --- Tools ---
    // VACANCY_FINDER controls whether the tool APPEARS, not what it can read.
    // It has no API of its own — it composes the rooms, tenancies and
    // room-change endpoints, each already governed — so nothing server-side
    // consults this. Kept because an owner still wants to decide which tools
    // clutter a manager's home, but do not mistake it for a data guard: the
    // data behind it is protected by ROOMS and TENANCIES.
    VACANCY_FINDER,
    // STAFF is deliberately absent. Staff management covers salaries,
    // employment records and a manager's OWN pay, so StaffService and
    // SalaryAccountService require the owner outright. Offering it as a
    // grant would be a toggle that changes nothing.
}
