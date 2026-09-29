package com.khatiyan.d_modules.compliance.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.a_auth.api.dto.UserIdentityResponse;
import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.tenancy.api.dto.IdCheckDeclarationInput;
import com.khatiyan.d_modules.tenancy.model.IdDocumentType;

/**
 * An existing account's gender and date of birth are not the owner's to change
 * at an ID check (owner's rule, 2026-09-27). Blanks, and an Undeclared gender,
 * are the owner's to record.
 */
class IdCheckKeepsAccountTest {

    private static final LocalDate DOB = LocalDate.of(1998, 4, 17);

    private static UserIdentityResponse account(Gender gender, LocalDate dateOfBirth) {
        return new UserIdentityResponse(UUID.randomUUID(), "Kevin Smith", "+919800000001", null, false,
                "12 Park Street", "700016", dateOfBirth, gender, true, false, false);
    }

    private static IdCheckDeclarationInput check(Gender gender, LocalDate dateOfBirth) {
        return new IdCheckDeclarationInput(true, IdDocumentType.AADHAAR, "1250", gender, dateOfBirth);
    }

    @Test
    void aCheckRecordingWhatTheAccountHoldsPasses() {
        assertThatCode(() -> TenancyAgreementService.ensureCheckKeepsAccount(
                account(Gender.MALE, DOB), check(Gender.MALE, DOB))).doesNotThrowAnyException();
    }

    @Test
    void aCheckCannotChangeAnAccountsGenderOrDateOfBirth() {
        assertThatThrownBy(() -> TenancyAgreementService.ensureCheckKeepsAccount(
                account(Gender.MALE, DOB), check(Gender.FEMALE, DOB)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("gender");
        assertThatThrownBy(() -> TenancyAgreementService.ensureCheckKeepsAccount(
                account(Gender.MALE, DOB), check(Gender.MALE, DOB.plusDays(1))))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("date of birth");
    }

    @Test
    void blanksAndAnUndeclaredGenderAreTheOwnersToRecord() {
        assertThatCode(() -> TenancyAgreementService.ensureCheckKeepsAccount(
                account(null, null), check(Gender.FEMALE, DOB))).doesNotThrowAnyException();
        assertThatCode(() -> TenancyAgreementService.ensureCheckKeepsAccount(
                account(Gender.UNDECLARED, DOB), check(Gender.TRANSGENDER, DOB))).doesNotThrowAnyException();
    }
}
