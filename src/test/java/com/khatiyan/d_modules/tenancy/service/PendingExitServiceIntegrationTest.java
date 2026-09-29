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
import com.khatiyan.d_modules.tenancy.event.TenancyPendingExitEvent;
import com.khatiyan.support.IntegrationTest;

import jakarta.persistence.EntityManager;

/** The pending-exit sweep against a real schema (spec 2026-09-26-pending-exit-design §5). */
@IntegrationTest
@Transactional
@RecordApplicationEvents
class PendingExitServiceIntegrationTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 26);

    @Autowired private JdbcTemplate jdbc;
    @Autowired private PendingExitService service;
    @Autowired private ApplicationEvents events;
    @Autowired private EntityManager entityManager;

    private AnalyticsFixtures fx;
    private UUID p;
    private UUID room;

    @BeforeEach
    void seed() {
        fx = new AnalyticsFixtures(jdbc);
        p = fx.property(Instant.parse("2026-01-01T00:00:00Z"));
        room = fx.room(p, 6, 4, 0, "PARTIALLY_OCCUPIED", true);
    }

    /** Flushed first: the sweep writes through JPA, this reads with plain SQL in the same transaction. */
    private String status(UUID tenancyId) {
        entityManager.flush();
        return jdbc.queryForObject("SELECT status FROM tenancy.tenancies WHERE id = ?", String.class, tenancyId);
    }

    /** What the nightly and startup sweep does, stay by stay. */
    private int sweep() {
        int marked = 0;
        for (UUID tenancyId : service.findDue(TODAY)) {
            if (service.markPendingExit(tenancyId, TODAY)) {
                marked++;
            }
        }
        return marked;
    }

    @Test
    void aFixedTermPastItsEndIsFlippedOnceAndKeepsItsBed() {
        UUID fixed = fx.monthlyStay(p, room, "ACTIVE", LocalDate.of(2026, 8, 20), null);
        fx.stayTerms(fixed, LocalDate.of(2026, 9, 20), null);

        assertThat(sweep()).isEqualTo(1);
        assertThat(status(fixed)).isEqualTo("PENDING_EXIT");
        entityManager.flush();
        assertThat(jdbc.queryForObject("SELECT is_active FROM tenancy.tenancies WHERE id = ?", Boolean.class, fixed)).isTrue();
        assertThat(events.stream(TenancyPendingExitEvent.class))
                .singleElement()
                .satisfies(event -> assertThat(event.checkoutDate()).isEqualTo(LocalDate.of(2026, 9, 20)));

        // A missed night, a restart, a second run: nothing more happens.
        assertThat(sweep()).isZero();
        assertThat(events.stream(TenancyPendingExitEvent.class)).hasSize(1);
    }

    @Test
    void onlyStaysPastTheirDateAreFlippedNotOnTheDayItself() {
        UUID dueToday = fx.monthlyStay(p, room, "ACTIVE", LocalDate.of(2026, 8, 26), null);
        fx.stayTerms(dueToday, TODAY, null);
        UUID indefinite = fx.monthlyStay(p, room, "ACTIVE", LocalDate.of(2026, 6, 1), null);
        UUID noticePast = fx.monthlyStay(p, room, "ON_NOTICE", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 9, 25));
        UUID guestPast = fx.dailyStay(p, room, LocalDate.of(2026, 9, 20), LocalDate.of(2026, 9, 24));

        assertThat(sweep()).isEqualTo(2);
        assertThat(status(dueToday)).isEqualTo("ACTIVE");
        assertThat(status(indefinite)).isEqualTo("ACTIVE");
        assertThat(status(noticePast)).isEqualTo("PENDING_EXIT");
        assertThat(status(guestPast)).isEqualTo("PENDING_EXIT");
    }

    @Test
    void aStayWhoseTenantAskedToWithdrawIsLeftForTheOwnerToDecide() {
        UUID notice = fx.monthlyStay(p, room, "ON_NOTICE", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 9, 25));
        jdbc.update("""
                INSERT INTO tenancy.tenancy_exit_requests (id, tenancy_id, tenant_user_id, property_id, room_id, type, status,
                    requested_checkout_date, notice_anchor_date, reference_code, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'NORMAL_NOTICE', 'WITHDRAWAL_REQUESTED', ?, ?, ?, now(), now())
                """, UUID.randomUUID(), notice, UUID.randomUUID(), p, room, LocalDate.of(2026, 9, 25),
                LocalDate.of(2026, 8, 25), "EXIT-" + UUID.randomUUID().toString().substring(0, 8));

        assertThat(sweep()).isZero();
        assertThat(status(notice)).isEqualTo("ON_NOTICE");
    }
}
