package com.khatiyan.a_auth.api.dto;

import java.time.LocalDate;

import com.khatiyan.a_auth.model.Gender;

import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Someone editing their own identity details.
 *
 * <p>Nothing is required. These fields are optional on a profile — the onboarding
 * gate is what insists on an address, and it says so at the point it matters
 * rather than blocking the settings screen from ever saving.
 *
 * <p>Blanks CLEAR. This is the person editing their own record, so an empty field
 * means they removed it — unlike the onboarding form, which only fills gaps.
 */
public record UpdateUserIdentityRequest(
        @Size(max = 300) String permanentAddress,

        @Pattern(regexp = "^$|^[0-9]{6}$", message = "PIN code must be 6 digits")
        String permanentAddressPincode,

        @Past(message = "Date of birth must be in the past") LocalDate dateOfBirth,

        Gender gender) {
}
