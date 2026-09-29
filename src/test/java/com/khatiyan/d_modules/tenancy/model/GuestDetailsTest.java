package com.khatiyan.d_modules.tenancy.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.time.ZoneId;

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
                .hasMessageContaining("18 or older");

        assertThatThrownBy(() -> guest("Ravi Menon", null, 121))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("as the ID shows it");
    }

    /** Since 2026-09-27 the form takes a date of birth, and the register's age is worked out from it. */
    @Test
    void worksTheAgeOutFromTheDateOfBirth() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        GuestDetails guest = new GuestDetails("Ravi Menon", "+919007433360", null,
                "12 Nandidurga Road", null, Gender.MALE, today.minusYears(29).minusDays(3));

        assertThat(guest.age()).isEqualTo(29);
        assertThat(guest.dateOfBirth()).isEqualTo(today.minusYears(29).minusDays(3));
    }

    @Test
    void aDateOfBirthUnder18IsRefused() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        // Eighteen tomorrow is not eighteen.
        assertThatThrownBy(() -> new GuestDetails("Ravi Menon", "+919007433360", null,
                "12 Nandidurga Road", null, Gender.MALE, today.minusYears(18).plusDays(1)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("18 or older");
    }

    private static GuestDetails guest(String name, String email, Integer age) {
        return new GuestDetails(name, "+919007433360", email, "12 Nandidurga Road, Bengaluru 560046", age, Gender.MALE);
    }
}
