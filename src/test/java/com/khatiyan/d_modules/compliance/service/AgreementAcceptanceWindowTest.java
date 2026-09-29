package com.khatiyan.d_modules.compliance.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.junit.jupiter.api.Test;

/**
 * An unsigned agreement expires at the first expiry run after its window, not
 * the moment the window ends: signing never checks the window.
 */
class AgreementAcceptanceWindowTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private final AgreementAcceptanceWindow window = new AgreementAcceptanceWindow(3, "0 30 0 * * *", "Asia/Kolkata");

    @Test
    void expiresAtTheFirstRunAfterTheWindow() {
        Instant created = ZonedDateTime.of(2026, 9, 27, 14, 47, 0, 0, IST).toInstant();

        assertThat(window.expiresAt(created)).isEqualTo(ZonedDateTime.of(2026, 10, 1, 0, 30, 0, 0, IST).toInstant());
    }

    @Test
    void anAgreementMadeJustBeforeARunWaitsForTheNextOne() {
        Instant created = ZonedDateTime.of(2026, 9, 27, 0, 20, 0, 0, IST).toInstant();

        assertThat(window.expiresAt(created)).isEqualTo(ZonedDateTime.of(2026, 9, 30, 0, 30, 0, 0, IST).toInstant());
    }
}
