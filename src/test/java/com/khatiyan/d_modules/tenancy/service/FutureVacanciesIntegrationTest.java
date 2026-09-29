package com.khatiyan.d_modules.tenancy.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.analytics.AnalyticsFixtures;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;
import com.khatiyan.d_modules.tenancy.service.FutureVacancies.Source;
import com.khatiyan.d_modules.tenancy.service.FutureVacancies.UpcomingVacancy;
import com.khatiyan.support.IntegrationTest;

import jakarta.persistence.EntityManager;

/** Which full-room beds can be booked ahead, against a real schema (V6162). */
@IntegrationTest
@Transactional
class FutureVacanciesIntegrationTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Asia/Kolkata"));

    @Autowired private JdbcTemplate jdbc;
    @Autowired private FutureVacancies vacancies;
    @Autowired private TenancyRepository tenancies;
    @Autowired private EntityManager entityManager;

    private AnalyticsFixtures fx;
    private UUID p;
    private UUID room;
    private UUID otherRoom;

    @BeforeEach
    void seed() {
        fx = new AnalyticsFixtures(jdbc);
        p = fx.property(Instant.parse("2026-01-01T00:00:00Z"));
        room = fx.room(p, 2, 2, 0, "OCCUPIED", true);
        otherRoom = fx.room(p, 2, 2, 0, "OCCUPIED", true);
    }

    /** A one-month fixed term ending {@code daysLeft} days from today. */
    private UUID fixedTerm(UUID roomId, int daysLeft) {
        LocalDate end = TODAY.plusDays(daysLeft);
        UUID id = fx.monthlyStay(p, roomId, "ACTIVE", end.minusMonths(1), null);
        jdbc.update("""
                UPDATE tenancy.tenancies SET agreement_validity_months = 1, agreement_end_date = ?, planned_end_date = ?
                WHERE id = ?
                """, end, end, id);
        return id;
    }

    /** A notice ending {@code daysLeft} days from today, approved {@code daysSinceApproval} days ago. */
    private UUID approvedNotice(UUID roomId, int daysLeft, int daysSinceApproval) {
        LocalDate checkout = TODAY.plusDays(daysLeft);
        UUID id = fx.monthlyStay(p, roomId, "ON_NOTICE", TODAY.minusMonths(3), checkout);
        jdbc.update("""
                INSERT INTO tenancy.tenancy_exit_requests (id, tenancy_id, tenant_user_id, property_id, room_id, type, status,
                    requested_checkout_date, approved_checkout_date, notice_anchor_date, decided_at, reference_code,
                    created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'NORMAL_NOTICE', 'APPROVED', ?, ?, ?, ?, ?, now(), now())
                """, UUID.randomUUID(), id, UUID.randomUUID(), p, roomId, checkout, checkout, TODAY.minusDays(25),
                java.sql.Timestamp.from(Instant.now().minus(daysSinceApproval, ChronoUnit.DAYS)),
                "EXIT-" + UUID.randomUUID().toString().substring(0, 8));
        return id;
    }

    private UUID bookingOn(UUID departingId, LocalDate startDate) {
        UUID booking = fx.monthlyStay(p, room, "SCHEDULED", startDate, null);
        jdbc.update("UPDATE tenancy.tenancies SET future_vacancy_tenancy_id = ? WHERE id = ?", departingId, booking);
        return booking;
    }

    private Tenancy load(UUID id) {
        entityManager.flush();
        entityManager.clear();
        return tenancies.findById(id).orElseThrow();
    }

    @Test
    void offersOnlyStaysCertainToEndInsideTheirWindow() {
        fixedTerm(room, 4);
        approvedNotice(room, 5, 5);
        // Still withdrawable, too far off, or never ending: not offered.
        approvedNotice(otherRoom, 5, 0);
        fixedTerm(otherRoom, 20);
        fx.monthlyStay(p, otherRoom, "ACTIVE", TODAY.minusMonths(6), null);

        assertThat(vacancies.upcoming(p, TODAY)).containsExactly(
                new UpcomingVacancy(room, TODAY.plusDays(4), Source.EXIT),
                new UpcomingVacancy(room, TODAY.plusDays(5), Source.EXIT));
    }

    @Test
    void claimsTheDepartureThatFreesByTheStartDateAndNeverTwice() {
        UUID fixed = fixedTerm(room, 4);
        UUID notice = approvedNotice(room, 5, 5);

        assertThat(vacancies.claim(p, room, TODAY.plusDays(3), TODAY)).isNull();
        FutureVacancies.Claim first = vacancies.claim(p, room, TODAY.plusDays(4), TODAY);
        assertThat(first.departingTenancyId()).isEqualTo(fixed);
        bookingOn(fixed, TODAY.plusDays(4));

        assertThat(vacancies.upcoming(p, TODAY)).extracting(UpcomingVacancy::availableFrom)
                .containsExactly(TODAY.plusDays(5));
        assertThat(vacancies.claim(p, room, TODAY.plusDays(5), TODAY).departingTenancyId()).isEqualTo(notice);
    }

    @Test
    void theBookingWaitsUntilSomeoneEndsTheStay() {
        UUID fixed = fixedTerm(room, 0);
        UUID booking = bookingOn(fixed, TODAY);

        assertThat(vacancies.bookingWaitingOn(load(fixed)).getId()).isEqualTo(booking);
        assertThat(vacancies.bedFreed(load(booking))).isFalse();

        fx.endStay(fixed, "EXITED", TODAY);
        assertThat(vacancies.bedFreed(load(booking))).isTrue();
        assertThat(vacancies.blocker(load(booking))).isNull();
    }

    @Test
    void oneLiveBookingPerDepartingStay() {
        UUID fixed = fixedTerm(room, 4);
        bookingOn(fixed, TODAY.plusDays(4));

        assertThatThrownBy(() -> bookingOn(fixed, TODAY.plusDays(6)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
