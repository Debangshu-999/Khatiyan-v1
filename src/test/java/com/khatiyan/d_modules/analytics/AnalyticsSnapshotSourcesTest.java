package com.khatiyan.d_modules.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.billing.analytics.BillingAnalytics;
import com.khatiyan.d_modules.property.analytics.PropertyAnalytics;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics;
import com.khatiyan.support.IntegrationTest;

@IntegrationTest
@Transactional
class AnalyticsSnapshotSourcesTest {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private PropertyAnalytics propertyAnalytics;
    @Autowired private TenancyAnalytics tenancyAnalytics;
    @Autowired private BillingAnalytics billingAnalytics;

    private AnalyticsFixtures fixtures;
    private UUID property;
    private UUID otherProperty;

    @BeforeEach
    void seed() {
        fixtures = new AnalyticsFixtures(jdbc);
        // 20:00 UTC on 13 Jan is 01:30 IST on 14 Jan: registration is an IST date.
        property = fixtures.property(Instant.parse("2026-01-13T20:00:00Z"));
        otherProperty = fixtures.property(Instant.parse("2026-01-01T00:00:00Z"));
    }

    @Test
    void registrationIsTheIstDateTheRowWasCreated() {
        assertThat(propertyAnalytics.registeredOn(property)).isEqualTo(LocalDate.of(2026, 1, 14));
        assertThatThrownBy(() -> propertyAnalytics.registeredOn(UUID.randomUUID())).isInstanceOf(NotFoundException.class);
        assertThat(propertyAnalytics.activePropertyIds()).contains(property, otherProperty);
    }

    @Test
    void bedsCountActiveRoomsOnlyAndEmptyMaintenanceBedsAreUnavailable() {
        fixtures.room(property, 3, 2, 1, "OCCUPIED", true);
        fixtures.room(property, 2, 0, 0, "VACANT", true);
        fixtures.room(property, 4, 1, 0, "MAINTENANCE", true);
        fixtures.room(property, 5, 0, 0, "VACANT", false);
        fixtures.room(otherProperty, 9, 9, 0, "OCCUPIED", true);

        assertThat(propertyAnalytics.bedCounts(property))
                .isEqualTo(new PropertyAnalytics.BedCounts(9, 3, 1, 3));
    }

    @Test
    void activeStaysSplitMonthlyFromDaily() {
        UUID room = fixtures.room(property, 6, 0, 0, "VACANT", true);
        fixtures.monthlyStay(property, room, "ACTIVE", LocalDate.of(2026, 2, 1), null);
        fixtures.monthlyStay(property, room, "ON_NOTICE", LocalDate.of(2026, 2, 1), LocalDate.of(2026, 10, 1));
        fixtures.monthlyStay(property, room, "ON_PREMATURE_NOTICE", LocalDate.of(2026, 3, 1), LocalDate.of(2026, 10, 5));
        fixtures.monthlyStay(property, room, "EXITED", LocalDate.of(2026, 2, 1), LocalDate.of(2026, 5, 1));
        fixtures.dailyStay(property, room, LocalDate.of(2026, 9, 25), LocalDate.of(2026, 9, 28));

        assertThat(tenancyAnalytics.activeStays(property)).isEqualTo(new TenancyAnalytics.ActiveStays(3, 1));
    }

    @Test
    void occupiedBedDaysCountEachStaysNightsInsideTheRange() {
        UUID room = fixtures.room(property, 6, 0, 0, "VACANT", true);
        LocalDate from = LocalDate.of(2026, 7, 1);
        LocalDate to = LocalDate.of(2026, 7, 31);
        fixtures.monthlyStay(property, room, "ACTIVE", LocalDate.of(2026, 7, 10), null);             // 10–31 Jul: 22
        fixtures.monthlyStay(property, room, "EXITED", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 7, 5)); // 1–5 Jul: 5
        fixtures.dailyStay(property, room, LocalDate.of(2026, 7, 20), LocalDate.of(2026, 7, 23));     // nights of 20, 21, 22: 3
        fixtures.monthlyStay(property, room, "CANCELLED", LocalDate.of(2026, 7, 1), null);
        fixtures.monthlyStay(property, room, "ACTIVE", LocalDate.of(2026, 8, 3), null);

        assertThat(tenancyAnalytics.occupiedBedDays(property, from, to)).isEqualTo(30);
    }

    @Test
    void duesAddUpUnpaidBillsAndDepositsFollowTheirLedger() {
        LocalDate sep = LocalDate.of(2026, 9, 1);
        fixtures.cycle(property, "OVERDUE", "RENT_CYCLE", sep, sep, 0, 500000, 0, 0, null);
        fixtures.cycle(property, "UNPAID", "RENT_CYCLE", sep, sep.plusDays(25), 0, 300000, 0, 0, null);
        fixtures.cycle(property, "UPCOMING", "RENT_CYCLE", sep.plusMonths(1), sep.plusMonths(1), 0, 200000, 0, 0, null);
        fixtures.cycle(property, "PAID", "RENT_CYCLE", sep, sep, 0, 900000, 0, 0, Instant.parse("2026-09-02T05:00:00Z"));
        fixtures.cycle(property, "CANCELLED", "ONE_OFF", sep, sep, 0, 100000, 0, 0, null);
        fixtures.cycle(otherProperty, "OVERDUE", "RENT_CYCLE", sep, sep, 0, 700000, 0, 0, null);

        assertThat(billingAnalytics.duesTotals(property)).isEqualTo(new BillingAnalytics.DuesTotals(1000000, 500000));

        fixtures.deposit(property, "ACTIVE", 1000000, 0);
        fixtures.deposit(property, "ACTIVE", 800000, 300000);
        fixtures.deposit(property, "PENDING_SETTLEMENT", 600000, 100000);
        fixtures.deposit(property, "SETTLED", 900000, 900000);

        assertThat(billingAnalytics.deposits(property)).isEqualTo(new BillingAnalytics.Deposits(1500000, 2, 500000, 1));
    }
}
