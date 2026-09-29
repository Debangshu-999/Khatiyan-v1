package com.khatiyan.d_modules.analytics;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.analytics.AuthAnalytics;
import com.khatiyan.d_modules.compliance.ComplianceAnalytics;
import com.khatiyan.d_modules.food.analytics.FoodAnalytics;
import com.khatiyan.d_modules.property.analytics.PropertyAnalytics;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics.DayMoves;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics.MonthlyStay;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics.StayInterval;
import com.khatiyan.d_modules.verification.analytics.VerificationAnalytics;
import com.khatiyan.support.IntegrationTest;

/** The Tenants division's source queries, each over its own module's schema. */
@IntegrationTest
@Transactional
class TenantsAnalyticsSourcesTest {

    private static final LocalDate JUL = LocalDate.of(2026, 7, 1);
    private static final LocalDate SEP_END = LocalDate.of(2026, 9, 30);

    @Autowired private JdbcTemplate jdbc;
    @Autowired private TenancyAnalytics tenancy;
    @Autowired private PropertyAnalytics property;
    @Autowired private VerificationAnalytics verification;
    @Autowired private ComplianceAnalytics compliance;
    @Autowired private FoodAnalytics food;
    @Autowired private AuthAnalytics auth;

    private AnalyticsFixtures fx;
    private UUID p;
    private UUID other;

    @BeforeEach
    void seed() {
        fx = new AnalyticsFixtures(jdbc);
        p = fx.property(Instant.parse("2026-01-01T00:00:00Z"));
        other = fx.property(Instant.parse("2026-01-01T00:00:00Z"));
    }

    @Test
    void currentStaysAreLiveAndWaitingMonthlyStaysAndMovesCountOnlyRealOnes() {
        UUID room = fx.room(p, 6, 3, 1, "PARTIALLY_OCCUPIED", true);
        UUID fixed = fx.monthlyStay(p, room, "ACTIVE", LocalDate.of(2026, 6, 1), null);
        fx.stayTerms(fixed, LocalDate.of(2026, 10, 10), true);
        fx.monthlyStay(p, room, "ON_NOTICE", LocalDate.of(2026, 7, 1), LocalDate.of(2026, 10, 5));
        fx.monthlyStay(p, room, "PENDING_ACCEPTANCE", LocalDate.of(2026, 9, 20), null);
        fx.monthlyStay(p, room, "EXITED", LocalDate.of(2026, 5, 1), LocalDate.of(2026, 8, 15));
        fx.monthlyStay(p, room, "CANCELLED", LocalDate.of(2026, 8, 1), null);
        // A future booking past its start date, still waiting for the bed it claimed to free up.
        fx.monthlyStay(p, room, "SCHEDULED", LocalDate.of(2026, 9, 22), null);
        fx.dailyStay(p, room, LocalDate.of(2026, 9, 24), LocalDate.of(2026, 9, 28));
        fx.monthlyStay(other, fx.room(other, 2, 1, 0, "PARTIALLY_OCCUPIED", true), "ACTIVE", LocalDate.of(2026, 8, 1), null);

        List<MonthlyStay> stays = tenancy.currentMonthlyStays(p);
        assertThat(stays).extracting(MonthlyStay::status).containsExactly("ACTIVE", "ON_NOTICE", "PENDING_ACCEPTANCE");
        assertThat(stays.get(0).exitOn()).isEqualTo(LocalDate.of(2026, 10, 10));
        assertThat(stays.get(0).idCheckConfirmed()).isTrue();
        assertThat(stays.get(1).exitOn()).isEqualTo(LocalDate.of(2026, 10, 5));
        assertThat(stays.get(2).live()).isFalse();

        // July's notice stay moved in, August's exit moved out. The pending, scheduled and cancelled stays never moved in.
        assertThat(tenancy.monthlyMoves(p, JUL, SEP_END)).containsExactly(
                new DayMoves(LocalDate.of(2026, 7, 1), 1, 0),
                new DayMoves(LocalDate.of(2026, 8, 15), 0, 1));

        // Nights in the range: a running stay to the range's end, a notice to its checkout, a guest to the night before theirs.
        assertThat(tenancy.stayIntervals(p, JUL, SEP_END)).containsExactly(
                new StayInterval(false, LocalDate.of(2026, 5, 1), LocalDate.of(2026, 8, 15)),
                new StayInterval(false, LocalDate.of(2026, 6, 1), SEP_END),
                new StayInterval(false, LocalDate.of(2026, 7, 1), LocalDate.of(2026, 10, 5)),
                new StayInterval(true, LocalDate.of(2026, 9, 24), LocalDate.of(2026, 9, 27)));
    }

    @Test
    void moveOutsAreNewestFirstAndOnlyLettableRoomsHaveVacancies() {
        UUID room = fx.room(p, 3, 1, 0, "PARTIALLY_OCCUPIED", true);
        UUID target = fx.room(p, 1, 1, 0, "OCCUPIED", true);
        fx.room(p, 2, 0, 0, "MAINTENANCE", true);
        fx.room(p, 2, 0, 0, "VACANT", false);
        fx.monthlyStay(p, room, "EXITED", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 8, 15));
        UUID guest = fx.dailyStay(p, room, LocalDate.of(2026, 9, 8), LocalDate.of(2026, 9, 10));
        fx.endStay(guest, "EXITED", LocalDate.of(2026, 9, 10));
        UUID mover = fx.monthlyStay(p, target, "ACTIVE", LocalDate.of(2026, 7, 1), null);
        // 20:00 UTC is 01:30 IST the next day: the move is dated the 21st.
        fx.roomChange(p, mover, room, target, "EXECUTED", Instant.parse("2026-09-20T20:00:00Z"));
        fx.roomChange(p, mover, room, target, "REJECTED", null);

        assertThat(tenancy.moveOutDatesByRoom(p).get(room)).containsExactly(
                LocalDate.of(2026, 9, 21), LocalDate.of(2026, 9, 10), LocalDate.of(2026, 8, 15));
        assertThat(property.roomVacancies(p)).singleElement().satisfies(vacancy -> {
            assertThat(vacancy.roomId()).isEqualTo(room);
            assertThat(vacancy.roomType()).isEqualTo("TRIPLE");
            assertThat(vacancy.capacity()).isEqualTo(3);
            assertThat(vacancy.taken()).isEqualTo(1);
        });
    }

    @Test
    void verificationAgreementsAndFoodProfilesEachReadTheirOwnRows() {
        UUID room = fx.room(p, 4, 3, 0, "PARTIALLY_OCCUPIED", true);
        UUID first = fx.monthlyStay(p, room, "ACTIVE", LocalDate.of(2026, 8, 1), null);
        UUID second = fx.monthlyStay(p, room, "ACTIVE", LocalDate.of(2026, 8, 2), null);
        UUID third = fx.monthlyStay(p, room, "PENDING_ACCEPTANCE", LocalDate.of(2026, 9, 25), null);

        fx.verificationGrant(p, first, "VERIFIED");
        fx.verificationGrant(p, second, "PENDING");
        assertThat(verification.verifiedTenancyIds(p)).containsExactly(first);

        fx.agreement(p, first, "ACCEPTED", Instant.parse("2026-09-01T10:00:00Z"), Instant.parse("2026-09-01T12:00:00Z"));
        fx.agreement(p, second, "ACCEPTED", Instant.parse("2026-09-02T10:00:00Z"), Instant.parse("2026-09-02T11:00:00Z"));
        fx.agreement(p, third, "PENDING_ACCEPTANCE", Instant.parse("2026-09-25T10:00:00Z"), null);
        assertThat(compliance.agreementStatusByTenancy(p)).containsExactlyInAnyOrderEntriesOf(Map.of(
                first, "ACCEPTED", second, "ACCEPTED", third, "PENDING_ACCEPTANCE"));
        ComplianceAnalytics.SigningTimes times = compliance.signingTimes(p, LocalDate.of(2026, 9, 1), SEP_END);
        assertThat(times.signed()).isEqualTo(2);
        assertThat(times.medianMinutes()).isEqualTo(90);

        UUID veg = fx.foodProfile(p, "Veg");
        UUID nonVeg = fx.foodProfile(p, "Non-veg");
        // 20:00 UTC on the 5th is the 6th in IST.
        fx.foodSubscription(p, first, veg, Instant.parse("2026-09-05T20:00:00Z"), null);
        fx.foodSubscription(p, second, nonVeg, Instant.parse("2026-08-01T05:00:00Z"), Instant.parse("2026-09-10T05:00:00Z"));
        assertThat(food.activeSubscriptions(p)).containsExactly(new FoodAnalytics.ActiveSubscription(first, veg, "Veg"));
        assertThat(food.subscriptionMoves(p, LocalDate.of(2026, 9, 1), SEP_END)).containsExactly(
                new FoodAnalytics.DaySubscriptions(LocalDate.of(2026, 9, 6), 1, 0),
                new FoodAnalytics.DaySubscriptions(LocalDate.of(2026, 9, 10), 0, 1));
    }

    @Test
    void profileCountsGroupGenderAndAgeAndNeverReturnRows() {
        LocalDate today = LocalDate.of(2026, 9, 26);
        UUID man = fx.user("MALE", LocalDate.of(2004, 1, 1));
        UUID woman = fx.user("FEMALE", LocalDate.of(2006, 9, 27));
        UUID quiet = fx.user("UNDECLARED", null);
        UUID older = fx.user(null, LocalDate.of(1980, 1, 1));

        AuthAnalytics.ProfileCounts counts = auth.profileCounts(List.of(man, woman, quiet, older), today);
        assertThat(counts.gender()).containsExactlyInAnyOrderEntriesOf(Map.of("MALE", 1, "FEMALE", 1, "NOT_GIVEN", 2));
        // 19 the day before her birthday and 22 are both 18–24. Born 1980 is 46.
        assertThat(counts.ageBands()).containsExactlyInAnyOrderEntriesOf(Map.of("18_24", 2, "NOT_GIVEN", 1, "45_PLUS", 1));
        assertThat(auth.profileCounts(List.of(), today).gender()).isEmpty();
    }
}
