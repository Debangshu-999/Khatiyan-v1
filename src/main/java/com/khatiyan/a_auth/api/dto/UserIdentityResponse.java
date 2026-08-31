package com.khatiyan.a_auth.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.a_auth.model.User;

/**
 * The particulars a legal document names a person by.
 *
 * <p>Deliberately NOT folded into {@link UserSummaryResponse}. That summary is
 * returned wherever a person is mentioned — chat rows, tenant lists, concern
 * threads — and putting a permanent address and a date of birth on it would leak
 * both into every one of those responses. This one is read only where a deed is
 * being built.
 *
 * @param agreementReady whether this person may appear as the Landlord of a deed:
 *                       a name, a VERIFIED email, and a permanent address. Age and
 *                       gender are deliberately excluded — they are optional on a
 *                       profile and a deed omits them when absent.
 */
public record UserIdentityResponse(
        UUID id,
        String fullName,
        String phone,
        String email,
        boolean emailVerified,
        String permanentAddress,
        String permanentAddressPincode,
        LocalDate dateOfBirth,
        Gender gender,
        boolean agreementReady) {

    public static UserIdentityResponse from(User user) {
        return new UserIdentityResponse(
                user.getId(),
                user.getFullName(),
                user.getPhone(),
                user.getEmail(),
                user.isEmailVerified(),
                user.getPermanentAddress(),
                user.getPermanentAddressPincode(),
                user.getDateOfBirth(),
                user.getGender(),
                user.hasAgreementIdentity());
    }

    /** Age in whole years on a given day, or null when no birth date is held. */
    public Integer ageOn(LocalDate on) {
        return dateOfBirth == null ? null : java.time.Period.between(dateOfBirth, on).getYears();
    }
}
