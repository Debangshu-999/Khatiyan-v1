package com.khatiyan.a_auth.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * A verified identity refuses edits instead of quietly ignoring them. The
 * address is not part of it (owner's decision, 2026-09-27) and stays editable.
 *
 * <p>Seen 2026-09-27: on a verified account the settings screen changed the
 * date of birth, the server dropped it without a word, and the screen said
 * "Details saved".
 */
class UserIdentityLockTest {

    private static final LocalDate DOB = LocalDate.of(1995, 6, 15);

    private static User verified() {
        User user = User.create("+919800000002", "Asha Roy", UserRole.USER);
        user.updateIdentity("12 Park Street, Kolkata", "700016", null, null);
        user.applyVerifiedIdentity("Asha Roy", DOB, Gender.FEMALE, "AADHAAR", Instant.parse("2026-09-27T10:00:00Z"));
        return user;
    }

    @Test
    void aChangedDateOfBirthIsRefused() {
        User user = verified();

        assertThatThrownBy(() -> user.updateIdentity("12 Park Street, Kolkata", "700016", LocalDate.of(1990, 1, 1),
                Gender.FEMALE))
                .isInstanceOf(ValidationException.class);
        assertThat(user.getDateOfBirth()).isEqualTo(DOB);
    }

    /** Not verified, so not locked: the address stays the person's own. */
    @Test
    void theAddressStaysEditable() {
        User user = verified();

        user.updateIdentity("Somewhere else", "700091", DOB, Gender.FEMALE);

        assertThat(user.getPermanentAddress()).isEqualTo("Somewhere else");
        assertThat(user.getPermanentAddressPincode()).isEqualTo("700091");
    }

    @Test
    void verificationLeavesTheAddressAlone() {
        User user = verified();

        assertThat(user.getPermanentAddress()).isEqualTo("12 Park Street, Kolkata");
    }

    @Test
    void aVerifiedGenderIsRefused() {
        User user = verified();

        assertThatThrownBy(() -> user.updateIdentity("12 Park Street, Kolkata", "700016", DOB, Gender.MALE))
                .isInstanceOf(ValidationException.class);
    }

    /** The screen sends every field, so unchanged values must pass. */
    @Test
    void theSameValuesPass() {
        User user = verified();

        assertThatCode(() -> user.updateIdentity("12 Park Street, Kolkata", "700016", DOB, Gender.FEMALE))
                .doesNotThrowAnyException();
    }
}
