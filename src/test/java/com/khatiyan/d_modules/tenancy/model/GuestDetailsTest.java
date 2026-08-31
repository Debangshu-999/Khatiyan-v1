package com.khatiyan.d_modules.tenancy.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.c_shared.exception.ValidationException;

class GuestDetailsTest {

    @Test
    void keepsWhatTheOwnerWroteDownAtCheckIn() {
        GuestDetails guest = guest("Ravi Menon", "ravi@example.com", 29);

        assertThat(guest.name()).isEqualTo("Ravi Menon");
        assertThat(guest.email()).isEqualTo("ravi@example.com");
        assertThat(guest.age()).isEqualTo(29);
        assertThat(guest.gender()).isEqualTo(Gender.MALE);
    }

    /**
     * The one field an owner may skip. A walk-in often has no reason to give an
     * email, and it is not what identifies them.
     */
    @Test
    void emailIsOptional() {
        assertThat(guest("Ravi Menon", null, 29).email()).isNull();
        assertThat(guest("Ravi Menon", "   ", 29).email()).isNull();
    }

    @Test
    void rejectsAnEmailThatIsNotOne() {
        assertThatThrownBy(() -> guest("Ravi Menon", "ravi.example.com", 29))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("valid email address");
    }

    @Test
    void requiresEverythingThatIdentifiesTheGuest() {
        assertThatThrownBy(() -> guest("  ", null, 29))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Guest name is required");

        assertThatThrownBy(() -> new GuestDetails("Ravi Menon", null, null, "12 Nandidurga Road", 29, Gender.MALE))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Guest phone number is required");

        assertThatThrownBy(() -> new GuestDetails("Ravi Menon", "+919007433360", null, "  ", 29, Gender.MALE))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Guest address is required");

        assertThatThrownBy(() -> new GuestDetails("Ravi Menon", "+919007433360", null, "12 Nandidurga Road", 29, null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Guest gender is required");
    }

    /**
     * The stay is billed to whoever it is registered under, and a minor cannot
     * be held to that. A family checking in registers under an adult.
     */
    @Test
    void refusesAnAgeThatCannotBeBilledTo() {
        assertThatThrownBy(() -> guest("Ravi Menon", null, 17))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("between 18 and 120");

        assertThatThrownBy(() -> guest("Ravi Menon", null, 121))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("between 18 and 120");
    }

    private static GuestDetails guest(String name, String email, Integer age) {
        return new GuestDetails(name, "+919007433360", email, "12 Nandidurga Road, Bengaluru 560046", age, Gender.MALE);
    }
}
