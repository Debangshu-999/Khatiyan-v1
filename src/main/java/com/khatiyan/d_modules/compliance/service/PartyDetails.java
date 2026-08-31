package com.khatiyan.d_modules.compliance.service;

/**
 * One side of the deed, as facts rather than as printed text.
 *
 * <p>Every field is nullable and absent fields are OMITTED from the party block
 * rather than printed blank — age and gender are optional on a profile, and a
 * deed reading "Age:  Years" would look like a document somebody failed to
 * finish.
 *
 * <p>{@code age} is a number computed at assembly from the stored birth date, so
 * a deed states the party's age on the day it was executed and nothing drifts
 * afterwards.
 *
 * @param known false when this party does not exist yet — the tenant, on a
 *              property's own template — in which case every particular renders
 *              as its own name, underlined
 */
public record PartyDetails(
        String name,
        Integer age,
        String gender,
        String phone,
        String email,
        String permanentAddress,
        String pincode,
        boolean known) {

    /** The tenant of a deed that has no tenant yet. */
    public static PartyDetails unknown() {
        return new PartyDetails(null, null, null, null, null, null, null, false);
    }
}
