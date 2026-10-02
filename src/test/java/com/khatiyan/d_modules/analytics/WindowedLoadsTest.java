package com.khatiyan.d_modules.analytics;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Date;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.d_modules.analytics.LargePropertySeeder.Seeded;
import com.khatiyan.d_modules.billing.model.BillingCycle;
import com.khatiyan.d_modules.billing.model.BillingCycleCategory;
import com.khatiyan.d_modules.billing.repository.BillingCycleRepository;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyExitRequestResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestStatus;
import com.khatiyan.support.IntegrationTest;

/**
 * The lists that used to be loaded whole and are now asked for narrowly
 * (2026-10-02). Each query has to return exactly what the old code kept after
 * loading everything, so each is checked against that rule on a year of
 * realistic data.
 */
@IntegrationTest
class WindowedLoadsTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BillingCycleRepository cycles;
    @Autowired private TenancyModule tenancyModule;

    private final LocalDate today = LocalDate.now(IST);
    private Seeded seeded;

    @BeforeEach
    void seed() {
        seeded = LargePropertySeeder.seed(jdbc, today, 20, 1, 11L);
    }

    @AfterEach
    void remove() {
        LargePropertySeeder.remove(jdbc, seeded);
    }

    @Test
    void theLatestRentBillOfEachStayIsItsNewestRentBillAndNeverAOneOff() {
        List<UUID> liveStays = jdbc.queryForList(
                "SELECT id FROM tenancy.tenancies WHERE property_id = ? AND is_active", UUID.class, seeded.propertyId());
        // What the old code arrived at: the newest RENT_CYCLE period per stay.
        Map<UUID, LocalDate> expected = jdbc.query("""
                SELECT tenancy_id, MAX(period_start_date) AS latest
                FROM billing.billing_cycles
                WHERE property_id = ? AND category = 'RENT_CYCLE' AND tenancy_id = ANY (?)
                GROUP BY tenancy_id
                """,
                ps -> {
                    ps.setObject(1, seeded.propertyId());
                    ps.setArray(2, ps.getConnection().createArrayOf("uuid", liveStays.toArray()));
                },
                rs -> {
                    Map<UUID, LocalDate> latest = new java.util.HashMap<>();
                    while (rs.next()) {
                        latest.put(rs.getObject("tenancy_id", UUID.class), rs.getObject("latest", Date.class).toLocalDate());
                    }
                    return latest;
                });

        List<BillingCycle> found = cycles.findLatestRentCycles(seeded.propertyId(), liveStays);

        assertThat(liveStays).hasSizeGreaterThan(10);
        assertThat(found).allMatch(cycle -> cycle.getCategory() == BillingCycleCategory.RENT_CYCLE);
        assertThat(found.stream().collect(Collectors.toMap(BillingCycle::getTenancyId, BillingCycle::getPeriodStartDate)))
                .isEqualTo(expected);
    }

    @Test
    void endedStaysSinceADateAreTheFullListCutAtThatDate() {
        LocalDate since = today.withDayOfMonth(1).minusMonths(1);
        List<TenancyResponse> all = tenancyModule.findInactiveByPropertyId(seeded.propertyId());

        List<TenancyResponse> recent = tenancyModule.findInactiveEndedOnOrAfter(seeded.propertyId(), since);

        // The seed's ended stays all carry an end date, so the cut is on it alone.
        assertThat(all).hasSizeGreaterThan(recent.size());
        assertThat(recent.stream().map(TenancyResponse::id).toList())
                .containsExactlyInAnyOrderElementsOf(all.stream()
                        .filter(stay -> stay.endDate() == null || !stay.endDate().isBefore(since))
                        .map(TenancyResponse::id)
                        .toList());
    }

    @Test
    void liveExitRequestsLeaveOutTheOnesAlreadyCarriedOut() {
        List<TenancyExitRequestResponse> all = tenancyModule.listPropertyExitRequests(seeded.ownerId(), seeded.propertyId());

        List<TenancyExitRequestResponse> live = tenancyModule.listOpenPropertyExitRequests(seeded.ownerId(), seeded.propertyId());

        assertThat(all).anyMatch(request -> request.status() == TenancyExitRequestStatus.EXECUTED);
        assertThat(live.stream().map(TenancyExitRequestResponse::id).toList())
                .containsExactlyInAnyOrderElementsOf(all.stream()
                        .filter(request -> request.status() == TenancyExitRequestStatus.REQUESTED
                                || request.status() == TenancyExitRequestStatus.APPROVED
                                || request.status() == TenancyExitRequestStatus.WITHDRAWAL_REQUESTED)
                        .map(TenancyExitRequestResponse::id)
                        .toList());
    }
}
