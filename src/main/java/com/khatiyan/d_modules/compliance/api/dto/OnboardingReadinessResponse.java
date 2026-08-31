package com.khatiyan.d_modules.compliance.api.dto;

/**
 * Whether a tenant can be onboarded at this property yet, and whose problem it is
 * if not.
 *
 * <p>Exists so the screen can show a blocking board BEFORE somebody fills in a
 * form, rather than letting them complete it and collecting a 422. The endpoint
 * still refuses independently — this read is the courtesy, not the rule.
 *
 * @param landlordReady the property OWNER has a name, a verified email and a
 *                      permanent address. The gate is on the owner rather than
 *                      the caller because the owner is the party the deed names.
 * @param actorIsOwner  whether the person asking can fix it themselves. A manager
 *                      cannot edit somebody else's profile, so telling them to
 *                      "complete your profile" would send them to a screen where
 *                      everything is already filled in.
 * @param ownerName     who to chase, for the manager's version of the message
 */
public record OnboardingReadinessResponse(
        boolean landlordReady,
        boolean actorIsOwner,
        String ownerName) {
}
