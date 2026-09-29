package com.khatiyan.d_modules.tenancy.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.analytics.AnalyticsFixtures;
import com.khatiyan.d_modules.tenancy.event.AgreementExpiryApproachingEvent;
import com.khatiyan.support.IntegrationTest;

/** Expiry reminders inside the stay's window, caught up after a missed night, never twice. */
@IntegrationTest
@Transactional
@RecordApplicationEvents
class AgreementExpiryReminderIntegrationTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 26);

    @Autowired private JdbcTemplate jdbc;
    @Autowired private AgreementExpiryReminderService service;
    @Autowired private ApplicationEvents events;

    private AnalyticsFixtures fx;
    private UUID p;
    private UUID room;

    @BeforeEach
    void seed() {
        fx = new AnalyticsFixtures(jdbc);
        p = fx.property(Instant.parse("2026-01-01T00:00:00Z"));
        room = fx.room(p, 6, 3, 0, "PARTIALLY_OCCUPIED", true);
    }

    private UUID fixedTerm(int months, LocalDate endsOn) {
        UUID stay = fx.monthlyStay(p, room, "ACTIVE", endsOn.minusMonths(months), null);
        fx.stayTerms(stay, endsOn, null);
        jdbc.update("UPDATE tenancy.tenancies SET agreement_validity_months = ? WHERE id = ?", months, stay);
        return stay;
    }

    @Test
    void aShortTermIsRemindedOnlyInsideItsWeekAndCaughtUpOnceAfterAMissedNight() {
        fixedTerm(1, TODAY.plusDays(5));
        fixedTerm(1, TODAY.plusDays(20));

        // Five days left in a 7-day window: the 7-day reminder. The one 20 days out is not due yet.
        assertThat(service.sendDue(TODAY)).isEqualTo(1);
        assertThat(events.stream(AgreementExpiryApproachingEvent.class)).singleElement()
                .satisfies(event -> assertThat(event.daysRemaining()).isEqualTo(5));

        // The same day again, and the next day (still the 7-day milestone): nothing new.
        assertThat(service.sendDue(TODAY)).isZero();
        assertThat(service.sendDue(TODAY.plusDays(1))).isZero();

        // Nights missed until two days are left: the 3-day reminder, once, not a burst.
        assertThat(service.sendDue(TODAY.plusDays(3))).isEqualTo(1);
        assertThat(service.sendDue(TODAY.plusDays(3))).isZero();
    }

    @Test
    void aLongTermIsRemindedAMonthOut() {
        fixedTerm(12, TODAY.plusDays(20));
        assertThat(service.sendDue(TODAY)).isEqualTo(1);
    }

    @Test
    void theWindowScalesWithTheTerm() {
        assertThat(AgreementExpiryReminderService.dueMilestone(5, 7)).isEqualTo(7);
        assertThat(AgreementExpiryReminderService.dueMilestone(2, 7)).isEqualTo(3);
        assertThat(AgreementExpiryReminderService.dueMilestone(0, 7)).isZero();
        assertThat(AgreementExpiryReminderService.dueMilestone(10, 7)).isNull();
        assertThat(AgreementExpiryReminderService.dueMilestone(10, 15)).isEqualTo(14);
        assertThat(AgreementExpiryReminderService.dueMilestone(20, 30)).isEqualTo(30);
        assertThat(AgreementExpiryReminderService.dueMilestone(-1, 7)).isNull();
    }
}
