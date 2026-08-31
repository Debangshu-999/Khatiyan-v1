package com.khatiyan.a_auth.model;

/**
 * A person's gender, as printed in an agreement's party block.
 *
 * <p>Optional everywhere. A deed omits the field when it is unset rather than
 * printing a blank, so nobody has to answer to let a tenancy start.
 *
 * <p>{@code TRANSGENDER} is listed because Indian forms are expected to — NALSA
 * (2014) requires a third option on official records, and leaving people to pick
 * "Other" is precisely what that judgment was about.
 *
 * <p>{@code UNDECLARED} is a deliberate answer, not the absence of one. Someone
 * who chooses it has been asked and declined; a null field means they were never
 * asked or skipped it. Both print nothing on the deed, but only one of them
 * should be re-prompted for.
 */
public enum Gender {
    MALE,
    FEMALE,
    TRANSGENDER,
    OTHER,
    UNDECLARED
}
