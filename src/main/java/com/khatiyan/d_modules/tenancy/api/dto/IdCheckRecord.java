package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.a_auth.model.Gender;

/**
 * The manual ID check on a stay, as the tenant's profile shows it.
 *
 * <p>Says that the date of birth was checked, not what it was: the check refuses
 * anyone under 18, and that answer is all a person reading the profile needs.
 *
 * @param gender      null on a declaration made before it was asked
 * @param ageChecked  false on a declaration made before it was asked
 */
public record IdCheckRecord(
        String documentType,
        String lastFour,
        Gender gender,
        boolean ageChecked,
        Instant checkedAt,
        UUID checkedByUserId) {
}
