package com.khatiyan.d_modules.tenancy.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.c_shared.exception.ValidationException;

/**
 * A manual ID check records gender and, on a monthly stay, the date of birth
 * the 18+ rule is made against (owner's rule, 2026-09-27).
 */
class TenancyIdCheckTest {

    /** 10:00 IST on 27 Sep 2026. */
    private static final Instant AT = Instant.parse("2026-09-27T04:30:00Z");
    private static final UUID ACTOR = UUID.randomUUID();

    private static Tenancy monthly() {
        return Tenancy.start(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), ACTOR,
                12_000_00, 10_000_00, LocalDate.of(2026, 10, 1));
    }

    private static Tenancy daily() {
        return Tenancy.startDailyGuest("TEN-X", UUID.randomUUID(), UUID.randomUUID(), ACTOR, 800_00,
                LocalDate.of(2026, 9, 27), LocalDate.of(2026, 9, 29),
                new GuestDetails("Ravi Menon", "9007433360", null, "12 Nandidurga Road", 29, Gender.MALE));
    }

    @Test
    void recordsTheGenderAndDateOfBirthTheOwnerChecked() {
        Tenancy stay = monthly();

        stay.confirmIdCheck(ACTOR, AT, IdDocumentType.AADHAAR, "1250", Gender.FEMALE, LocalDate.of(2000, 1, 15));

        assertThat(stay.getIdCheckedGender()).isEqualTo(Gender.FEMALE);
        assertThat(stay.getIdCheckedDateOfBirth()).isEqualTo(LocalDate.of(2000, 1, 15));
    }

    @Test
    void genderIsRequiredAndCannotBeUndeclared() {
        assertThatThrownBy(() -> monthly().confirmIdCheck(ACTOR, AT, IdDocumentType.AADHAAR, "1250",
                null, LocalDate.of(2000, 1, 15)))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> monthly().confirmIdCheck(ACTOR, AT, IdDocumentType.AADHAAR, "1250",
                Gender.UNDECLARED, LocalDate.of(2000, 1, 15)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("gender");
    }

    @Test
    void aMonthlyStayNeedsADateOfBirthThatMakesThemAnAdult() {
        assertThatThrownBy(() -> monthly().confirmIdCheck(ACTOR, AT, IdDocumentType.PAN, "4417", Gender.MALE, null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("date of birth");

        // Eighteen tomorrow is not eighteen.
        assertThatThrownBy(() -> monthly().confirmIdCheck(ACTOR, AT, IdDocumentType.PAN, "4417", Gender.MALE,
                LocalDate.of(2008, 9, 28)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("18 or older");

        Tenancy birthday = monthly();
        birthday.confirmIdCheck(ACTOR, AT, IdDocumentType.PAN, "4417", Gender.MALE, LocalDate.of(2008, 9, 27));
        assertThat(birthday.getIdCheckConfirmed()).isTrue();
    }

    /** Since 2026-09-27 a daily guest's check records their date of birth too, and makes the same 18+ check. */
    @Test
    void aDailyGuestsCheckRecordsTheirDateOfBirth() {
        Tenancy guest = daily();

        guest.confirmIdCheck(ACTOR, AT, IdDocumentType.VOTER_ID, "9981", Gender.MALE, LocalDate.of(1990, 5, 1));

        assertThat(guest.getIdCheckedGender()).isEqualTo(Gender.MALE);
        assertThat(guest.getIdCheckedDateOfBirth()).isEqualTo(LocalDate.of(1990, 5, 1));
    }

    @Test
    void aDailyGuestsCheckFallsBackToTheGuestFormsDateOfBirth() {
        Tenancy guest = Tenancy.startDailyGuest("TEN-Y", UUID.randomUUID(), UUID.randomUUID(), ACTOR, 800_00,
                LocalDate.of(2026, 9, 27), LocalDate.of(2026, 9, 29),
                new GuestDetails("Ravi Menon", "9007433360", null, "12 Nandidurga Road", null, Gender.MALE,
                        LocalDate.of(1994, 2, 11)));

        guest.confirmIdCheck(ACTOR, AT, IdDocumentType.VOTER_ID, "9981", Gender.MALE, null);

        assertThat(guest.getGuestDateOfBirth()).isEqualTo(LocalDate.of(1994, 2, 11));
        assertThat(guest.getIdCheckedDateOfBirth()).isEqualTo(LocalDate.of(1994, 2, 11));
    }
}
