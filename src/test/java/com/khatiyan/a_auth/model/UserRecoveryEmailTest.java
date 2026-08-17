package com.khatiyan.a_auth.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Changing the recovery address drops its verification; re-saving it does not.
 *
 * <p>The address is the PIN-reset channel, so the two directions fail in
 * opposite ways. Keeping verification across a real change would let a stale
 * proof unlock a live reset path. Dropping it when nothing changed costs
 * someone their verified status for opening a field and saving.
 */
class UserRecoveryEmailTest {

    private static User verifiedUserWith(String email) {
        User user = User.create("+919000000000", "Test User", UserRole.USER);
        user.updateRecoveryEmail(email);
        user.markEmailVerified();
        return user;
    }

    @Test
    void keepsVerificationWhenTheSameAddressIsSavedAgain() {
        User user = verifiedUserWith("owner@example.com");

        user.updateRecoveryEmail("owner@example.com");

        assertThat(user.isEmailVerified()).isTrue();
        assertThat(user.getEmail()).isEqualTo("owner@example.com");
    }

    /** Case and surrounding space are not a change — the stored form is normalised. */
    @Test
    void keepsVerificationWhenOnlyCaseOrSpacingDiffers() {
        User user = verifiedUserWith("owner@example.com");

        user.updateRecoveryEmail("  Owner@Example.COM  ");

        assertThat(user.isEmailVerified()).isTrue();
        assertThat(user.getEmail()).isEqualTo("owner@example.com");
    }

    @Test
    void dropsVerificationWhenTheAddressActuallyChanges() {
        User user = verifiedUserWith("owner@example.com");

        user.updateRecoveryEmail("someone-else@example.com");

        assertThat(user.isEmailVerified()).isFalse();
        assertThat(user.getEmail()).isEqualTo("someone-else@example.com");
    }

    /**
     * Returning to a previously verified address still re-verifies. Nothing
     * records that it was ever verified, and control of an address can change
     * hands between the two moments.
     */
    @Test
    void dropsVerificationWhenReturningToAnEarlierAddress() {
        User user = verifiedUserWith("owner@example.com");
        user.updateRecoveryEmail("second@example.com");
        user.markEmailVerified();

        user.updateRecoveryEmail("owner@example.com");

        assertThat(user.isEmailVerified()).isFalse();
        assertThat(user.getEmail()).isEqualTo("owner@example.com");
    }
}
