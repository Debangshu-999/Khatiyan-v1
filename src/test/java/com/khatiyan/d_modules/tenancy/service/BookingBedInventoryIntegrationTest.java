package com.khatiyan.d_modules.tenancy.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.analytics.AnalyticsFixtures;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.booking.service.BookingInventoryService;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.support.IntegrationTest;
import com.khatiyan.support.PublishedEvents;

/** Actual inventory transactions and contention, not mocked room counts or repository winners. */
@IntegrationTest
class BookingBedInventoryIntegrationTest {
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private final JdbcTemplate jdbc;
    private final BookingInventoryService bookings;
    private final TenancyModule tenancies;
    private final TenancyService tenancyService;
    private final TenancyRoomChangeRequestService roomChanges;
    private final FutureVacancies legacyVacancies;
    private final PropertyModule properties;
    private final TransactionTemplate tx;
    @MockitoBean private AuthModule auth;
    @MockitoBean private BillingModule billing;
    @MockitoBean private NotificationModule notifications;

    @Autowired
    BookingBedInventoryIntegrationTest(JdbcTemplate jdbc, BookingInventoryService bookings, TenancyModule tenancies,
            TenancyService tenancyService, TenancyRoomChangeRequestService roomChanges, FutureVacancies legacyVacancies,
            PropertyModule properties, PlatformTransactionManager transactions) {
        this.jdbc = jdbc;
        this.bookings = bookings;
        this.tenancies = tenancies;
        this.tenancyService = tenancyService;
        this.roomChanges = roomChanges;
        this.legacyVacancies = legacyVacancies;
        this.properties = properties;
        this.tx = new TransactionTemplate(transactions);
    }

    private AnalyticsFixtures fx;
    private UUID property;
    private UUID owner;
    private UUID room;
    private Instant submitted;
    private LocalDate today;

    @BeforeEach
    void seed() {
        submitted = Instant.now();
        today = submitted.atZone(IST).toLocalDate();
        fx = new AnalyticsFixtures(jdbc);
        property = fx.property(submitted);
        owner = jdbc.queryForObject("SELECT owner_id FROM property.properties WHERE id = ?", UUID.class, property);
        room = fx.room(property, 1, 0, 0, "VACANT", true);
        when(auth.provisionTenantUser(any(), any(), any())).thenAnswer(call -> UUID.randomUUID());
        when(auth.findById(any())).thenAnswer(call -> Optional.of(new UserSummaryResponse(
                call.getArgument(0), "+919007433360", null, "Fixture person", null, UserRole.USER,
                false, true, true, false, true)));
    }

    @AfterEach
    void remove() {
        PublishedEvents.awaitHandled(jdbc, "", property);
        jdbc.update("DELETE FROM tenancy.bed_holds WHERE property_id = ?", property);
        // Incoming legacy rows reference their source moves/stays; remove
        // those children before deleting the departing requests and tenancies.
        jdbc.update("DELETE FROM tenancy.tenancies WHERE property_id = ? "
                + "AND (future_vacancy_source_id IS NOT NULL OR future_vacancy_tenancy_id IS NOT NULL)", property);
        jdbc.update("DELETE FROM tenancy.tenancy_room_change_requests WHERE property_id = ?", property);
        jdbc.update("DELETE FROM tenancy.tenancy_exit_requests WHERE property_id = ?", property);
        jdbc.update("DELETE FROM tenancy.tenancies WHERE property_id = ?", property);
        jdbc.update("DELETE FROM property.rooms WHERE property_id = ?", property);
        jdbc.update("DELETE FROM property.properties WHERE id = ?", property);
    }

    private void reserve(UUID booking, LocalDate date, UUID exit) {
        bookings.reserve(booking, property, room, submitted, date, exit);
    }

    private UUID notice(int checkoutOffset, int approvedDaysAgo) {
        jdbc.update("UPDATE property.rooms SET occupied_count = 1, status = 'OCCUPIED' WHERE id = ?", room);
        UUID stay = fx.monthlyStay(property, room, "ON_NOTICE", today.minusMonths(3), today.plusDays(checkoutOffset));
        UUID tenant = jdbc.queryForObject("SELECT user_id FROM tenancy.tenancies WHERE id = ?", UUID.class, stay);
        UUID exit = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO tenancy.tenancy_exit_requests
                (id, tenancy_id, tenant_user_id, property_id, room_id, type, status,
                 requested_checkout_date, approved_checkout_date, notice_anchor_date, decided_at,
                 reference_code, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'NORMAL_NOTICE', 'APPROVED', ?, ?, ?, ?, ?, now(), now())
                """, exit, stay, tenant, property, room, today.plusDays(checkoutOffset), today.plusDays(checkoutOffset),
                today.minusDays(25), Timestamp.from(submitted.minus(approvedDaysAgo, ChronoUnit.DAYS)),
                "EXIT-" + exit.toString().replace("-", ""));
        return exit;
    }

    private UUID departing(UUID exit) {
        return jdbc.queryForObject("SELECT tenancy_id FROM tenancy.tenancy_exit_requests WHERE id = ?", UUID.class, exit);
    }

    private int reserved() {
        return jdbc.queryForObject("SELECT reserved_count FROM property.rooms WHERE id = ?", Integer.class, room);
    }

    private int occupied() {
        return jdbc.queryForObject("SELECT occupied_count FROM property.rooms WHERE id = ?", Integer.class, room);
    }

    @Test
    void liveHoldIsOneBedReplayIsStableAndReleaseIsExactlyOnce() {
        UUID booking = UUID.randomUUID();
        reserve(booking, today.plusDays(8), null);
        var first = tenancies.findBookingBed(booking, property).orElseThrow();
        reserve(booking, today.plusDays(8), null);
        assertThat(tenancies.findBookingBed(booking, property).orElseThrow()).isEqualTo(first);
        assertThat(reserved()).isEqualTo(1);
        assertThat(occupied()).isZero();
        assertThat(properties.getAvailableVacancies(property, room)).isZero();
        assertThat(bookings.release(booking, property)).isTrue();
        assertThat(bookings.release(booking, property)).isFalse();
        assertThat(reserved()).isZero();
        assertThatThrownBy(() -> reserve(booking, today.plusDays(8), null)).isInstanceOf(ValidationException.class);
    }

    @Test
    void aRetryCannotReplaceItsRoomDateOrProperty() {
        UUID booking = UUID.randomUUID();
        reserve(booking, today.plusDays(8), null);
        assertThatThrownBy(() -> reserve(booking, today.plusDays(9), null)).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> bookings.reserve(booking, property, UUID.randomUUID(), submitted,
                today.plusDays(8), null)).isInstanceOf(ValidationException.class);
        assertThat(reserved()).isEqualTo(1);
        assertThat(tenancies.findBookingBed(booking, UUID.randomUUID())).isEmpty();
    }

    @Test
    void failureAfterReservingRollsBackHoldAndCapacityTogether() {
        UUID booking = UUID.randomUUID();
        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
            reserve(booking, today.plusDays(8), null);
            throw new IllegalStateException("simulated later booking write failure");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(reserved()).isZero();
        assertThat(tenancies.findBookingBed(booking, property)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2})
    void earlyExitAllowsEveryDateFromThreeThroughTwentyOne(int checkoutOffset) {
        UUID exit = notice(checkoutOffset, 5);
        assertThat(bookings.futureVacancies(property)).singleElement().satisfies(option -> {
            assertThat(option.earliestMoveInDate()).isEqualTo(today.plusDays(3));
            assertThat(option.latestMoveInDate()).isEqualTo(today.plusDays(21));
        });
        for (int offset = 3; offset <= 21; offset++) {
            UUID booking = UUID.randomUUID();
            reserve(booking, today.plusDays(offset), exit);
            assertThat(tenancies.findBookingBed(booking, property).orElseThrow().state()).isEqualTo("WAITING");
            assertThat(reserved()).isZero();
            assertThat(occupied()).isEqualTo(1);
            assertThat(bookings.release(booking, property)).isTrue();
            assertThat(bookings.release(booking, property)).isFalse();
        }
    }

    @Test
    void laterCheckoutRaisesTheFloorAndAnEmptyIntersectionIsExcluded() {
        UUID exit = notice(8, 5);
        assertThat(bookings.futureVacancies(property)).singleElement()
                .satisfies(option -> assertThat(option.earliestMoveInDate()).isEqualTo(today.plusDays(9)));
        assertThatThrownBy(() -> reserve(UUID.randomUUID(), today.plusDays(8), exit)).isInstanceOf(ValidationException.class);
        jdbc.update("UPDATE tenancy.tenancy_exit_requests SET approved_checkout_date = ?, requested_checkout_date = ? WHERE id = ?",
                today.plusDays(21), today.plusDays(21), exit);
        jdbc.update("UPDATE tenancy.tenancies SET end_date = ? WHERE id = ?", today.plusDays(21), departing(exit));
        assertThat(bookings.futureVacancies(property)).isEmpty();
        assertThatThrownBy(() -> reserve(UUID.randomUUID(), today.plusDays(21), exit)).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> reserve(UUID.randomUUID(), today.plusDays(22), exit)).isInstanceOf(ValidationException.class);
    }

    @Test
    void twoAndTwentyTwoAreRejectedBeforeAnyCapacityWrite() {
        for (int offset : List.of(2, 22)) {
            assertThatThrownBy(() -> reserve(UUID.randomUUID(), today.plusDays(offset), null)).isInstanceOf(ValidationException.class);
        }
        assertThat(reserved()).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM tenancy.bed_holds WHERE property_id = ?", Integer.class, property)).isZero();
    }

    @Test
    void withdrawablePendingWithdrawalAndMismatchedExitNeverOfferOrReserve() {
        UUID exit = notice(3, 0);
        assertThat(bookings.futureVacancies(property)).isEmpty();
        assertThatThrownBy(() -> reserve(UUID.randomUUID(), today.plusDays(8), exit)).isInstanceOf(ValidationException.class);
        jdbc.update("UPDATE tenancy.tenancy_exit_requests SET decided_at = ?, status = 'WITHDRAWAL_REQUESTED' WHERE id = ?",
                Timestamp.from(submitted.minus(5, ChronoUnit.DAYS)), exit);
        assertThat(bookings.futureVacancies(property)).isEmpty();
        jdbc.update("UPDATE tenancy.tenancy_exit_requests SET status = 'APPROVED', tenant_user_id = ? WHERE id = ?",
                UUID.randomUUID(), exit);
        assertThat(bookings.futureVacancies(property)).isEmpty();
        assertThatThrownBy(() -> reserve(UUID.randomUUID(), today.plusDays(8), exit)).isInstanceOf(ValidationException.class);
    }

    @Test
    void fixedTermOnlyStaysAreKeptForOwnersNotTenantBookingCandidates() {
        jdbc.update("UPDATE property.rooms SET occupied_count = 1, status = 'OCCUPIED' WHERE id = ?", room);
        UUID stay = fx.monthlyStay(property, room, "ACTIVE", today.minusMonths(1), null);
        jdbc.update("UPDATE tenancy.tenancies SET agreement_validity_months = 1, agreement_end_date = ?, planned_end_date = ? WHERE id = ?",
                today.plusDays(3), today.plusDays(3), stay);
        assertThat(legacyVacancies.upcoming(property, today)).hasSize(1);
        assertThat(bookings.futureVacancies(property)).isEmpty();
    }

    @Test
    void onlyAnActualDepartureMaterializesAndThenReleasesTheFutureHold() {
        UUID exit = notice(0, 5);
        UUID booking = UUID.randomUUID();
        reserve(booking, today.plusDays(8), exit);
        assertThat(reserved()).isZero();
        // Passing the expected checkout by itself never vacates occupancy.
        assertThat(occupied()).isEqualTo(1);
        tenancyService.end(owner, departing(exit), today, "TEST_DEPARTURE");
        assertThat(occupied()).isZero();
        assertThat(reserved()).isEqualTo(1);
        assertThat(tenancies.findBookingBed(booking, property).orElseThrow().state()).isEqualTo("HELD");
        assertThat(properties.getAvailableVacancies(property, room)).isZero();
        assertThat(bookings.release(booking, property)).isTrue();
        assertThat(bookings.release(booking, property)).isFalse();
        assertThat(reserved()).isZero();
    }

    @Test
    void aFailedDepartureRollsBackMaterializationAndOccupancy() {
        UUID exit = notice(0, 5);
        UUID booking = UUID.randomUUID();
        reserve(booking, today.plusDays(8), exit);
        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
            tenancyService.end(owner, departing(exit), today, "TEST_DEPARTURE");
            throw new IllegalStateException("simulated departure failure");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(tenancies.findBookingBed(booking, property).orElseThrow().state()).isEqualTo("WAITING");
        assertThat(occupied()).isEqualTo(1);
        assertThat(reserved()).isZero();
    }

    @Test
    void legacyPendingCancellationAfterDepartureReleasesItsMaterializedReservation() {
        UUID exit = notice(0, 5);
        var legacy = tenancyService.onboardPending(owner, "+919007433360", "Legacy tenant", property, room,
                null, null, today.plusDays(8), null).tenancy();
        tenancyService.end(owner, departing(exit), today, "TEST_DEPARTURE");
        assertThat(occupied()).isZero();
        assertThat(reserved()).isEqualTo(1);
        tenancyService.cancelPendingAsManager(owner, legacy.id(), "Tenant withdrew");
        assertThat(reserved()).isZero();
        assertThat(jdbc.queryForObject("SELECT state FROM tenancy.bed_holds WHERE owner_kind = 'TENANCY' AND owner_id = ?",
                String.class, legacy.id())).isEqualTo("RELEASED");
    }

    @Test
    void legacyActivationConsumesTheHeldBedWithoutMakingItPubliclyAvailable() {
        UUID exit = notice(0, 5);
        var legacy = tenancyService.onboardPending(owner, "+919007433360", "Legacy tenant", property, room,
                null, null, today.plusDays(8), null).tenancy();
        tenancyService.end(owner, departing(exit), today, "TEST_DEPARTURE");
        assertThat(properties.getAvailableVacancies(property, room)).isZero();
        tenancyService.acceptTermsAndActivate(legacy.id(), legacy.userId());
        assertThat(reserved()).isEqualTo(1);
        assertThat(occupied()).isZero();
        assertThat(tenancyService.activateScheduledBooking(legacy.id(), today.plusDays(8))).isTrue();
        assertThat(reserved()).isZero();
        assertThat(occupied()).isEqualTo(1);
        assertThat(properties.getAvailableVacancies(property, room)).isZero();
        assertThat(jdbc.queryForObject("SELECT state FROM tenancy.bed_holds WHERE owner_kind = 'TENANCY' AND owner_id = ?",
                String.class, legacy.id())).isEqualTo("CONSUMED");
    }

    @Test
    void cancellationRacingDepartureReleasesExactlyOneBed() throws Exception {
        UUID exit = notice(0, 5);
        UUID booking = UUID.randomUUID();
        reserve(booking, today.plusDays(8), exit);
        bothSucceed(() -> bookings.release(booking, property),
                () -> tenancyService.end(owner, departing(exit), today, "TEST_DEPARTURE"));
        assertThat(reserved()).isZero();
        assertThat(occupied()).isZero();
        assertThat(tenancies.findBookingBed(booking, property).orElseThrow().state()).isEqualTo("RELEASED");
        assertThat(bookings.release(booking, property)).isFalse();
    }

    @Test
    void aMaterializedMoveHoldDoesNotBlockTheOutgoingTenantsDifferentBed() {
        jdbc.update("UPDATE property.rooms SET occupied_count = 1, status = 'OCCUPIED' WHERE id = ?", room);
        UUID mover = fx.monthlyStay(property, room, "ACTIVE", today.minusMonths(3), null);
        UUID tenant = jdbc.queryForObject("SELECT user_id FROM tenancy.tenancies WHERE id = ?", UUID.class, mover);
        UUID target = fx.room(property, 1, 0, 1, "VACANT", true);
        fx.roomChange(property, mover, room, target, "APPROVED", null);
        UUID move = jdbc.queryForObject("SELECT id FROM tenancy.tenancy_room_change_requests WHERE tenancy_id = ?", UUID.class, mover);
        jdbc.update("UPDATE tenancy.tenancy_room_change_requests SET tenant_user_id = ?, effective_transfer_date = ? WHERE id = ?",
                tenant, today, move);
        var legacy = tenancyService.onboardPending(owner, "+919007433360", "Legacy tenant", property, room,
                null, null, today.plusDays(8), null).tenancy();
        roomChanges.execute(owner, move);
        assertThat(reserved()).isEqualTo(1);
        assertThat(occupied()).isZero();

        UUID exit = UUID.randomUUID();
        jdbc.update("UPDATE tenancy.tenancies SET status = 'ON_NOTICE', end_date = ? WHERE id = ?", today, mover);
        jdbc.update("""
                INSERT INTO tenancy.tenancy_exit_requests
                (id, tenancy_id, tenant_user_id, property_id, room_id, type, status,
                 requested_checkout_date, approved_checkout_date, notice_anchor_date, decided_at,
                 reference_code, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'NORMAL_NOTICE', 'APPROVED', ?, ?, ?, ?, ?, now(), now())
                """, exit, mover, tenant, property, target, today, today, today.minusDays(25),
                Timestamp.from(submitted.minus(5, ChronoUnit.DAYS)), "EXIT-" + exit.toString().replace("-", ""));
        assertThat(bookings.futureVacancies(property)).singleElement()
                .satisfies(option -> assertThat(option.roomId()).isEqualTo(target));
        UUID nextBooking = UUID.randomUUID();
        bookings.reserve(nextBooking, property, target, submitted, today.plusDays(8), exit);
        tenancyService.end(owner, mover, today, "TEST_DEPARTURE");
        assertThat(reserved()).isEqualTo(1); // old room still belongs to the legacy incoming tenant
        assertThat(jdbc.queryForObject("SELECT reserved_count FROM property.rooms WHERE id = ?", Integer.class, target)).isEqualTo(1);
        bookings.release(nextBooking, property);
        tenancyService.cancelPendingAsManager(owner, legacy.id(), "No longer moving in");
        assertThat(jdbc.queryForObject("SELECT sum(reserved_count) FROM property.rooms WHERE property_id = ?", Integer.class, property)).isZero();
    }

    private boolean succeeds(Runnable action) {
        try { action.run(); return true; }
        catch (ValidationException | org.springframework.dao.DataIntegrityViolationException expected) { return false; }
    }

    private void oneWinner(Runnable first, Runnable second) throws Exception {
        contend(first, second, false);
    }

    private void bothSucceed(Runnable first, Runnable second) throws Exception {
        contend(first, second, true);
    }

    private void contend(Runnable first, Runnable second, boolean expectBoth) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        var threads = Executors.newFixedThreadPool(2);
        try {
            Callable<Boolean> firstCall = () -> { ready.countDown(); if (!go.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("start timeout"); return succeeds(first); };
            Callable<Boolean> secondCall = () -> { ready.countDown(); if (!go.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("start timeout"); return succeeds(second); };
            var a = threads.submit(firstCall);
            var b = threads.submit(secondCall);
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            assertThat(List.of(a.get(30, TimeUnit.SECONDS), b.get(30, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, expectBoth);
        } finally {
            go.countDown();
            threads.shutdownNow();
            if (!threads.awaitTermination(10, TimeUnit.SECONDS)) throw new IllegalStateException("race workers did not stop");
        }
    }

    @Test
    void twoBookingsRaceForTheLastLiveBedWithOneWinner() throws Exception {
        oneWinner(() -> reserve(UUID.randomUUID(), today.plusDays(8), null),
                () -> reserve(UUID.randomUUID(), today.plusDays(8), null));
        assertThat(reserved()).isEqualTo(1);
    }

    @Test
    void bookingAndOrdinaryOnboardingRaceForTheLastLiveBed() throws Exception {
        oneWinner(() -> reserve(UUID.randomUUID(), today.plusDays(8), null),
                () -> tenancyService.onboardPending(owner, "+919007433360", "New tenant", property, room,
                        null, null, today, null));
        assertThat(occupied() + reserved()).isEqualTo(1);
    }

    @Test
    void twoBookingsRaceForOneFutureDepartureWithOneWinner() throws Exception {
        UUID exit = notice(3, 5);
        oneWinner(() -> reserve(UUID.randomUUID(), today.plusDays(8), exit),
                () -> reserve(UUID.randomUUID(), today.plusDays(8), exit));
        assertThat(bookings.futureVacancies(property)).isEmpty();
        assertThat(reserved()).isZero();
        assertThat(occupied()).isEqualTo(1);
    }

    @Test
    void bookingAndLegacyFutureOnboardingCannotPromiseTheSameDeparture() throws Exception {
        UUID exit = notice(3, 5);
        oneWinner(() -> reserve(UUID.randomUUID(), today.plusDays(8), exit),
                () -> tenancyService.onboardPending(owner, "+919007433360", "Legacy tenant", property, room,
                        null, null, today.plusDays(3), null));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM tenancy.bed_holds WHERE property_id = ? "
                + "AND state IN ('WAITING','HELD')", Integer.class, property)).isEqualTo(1);
        assertThat(bookings.futureVacancies(property)).isEmpty();
        assertThat(legacyVacancies.upcoming(property, today)).isEmpty();
    }

    @Test
    void databaseGuardRejectsAnAlternateLegacyMoveClaimOfTheSamePromisedBed() {
        UUID exit = notice(3, 5);
        UUID booking = UUID.randomUUID();
        reserve(booking, today.plusDays(8), exit);
        UUID target = fx.room(property, 1, 0, 1, "VACANT", true);
        // Deliberately bypass the mutually-exclusive request preflight: the
        // canonical departure index must still defeat move-vs-exit aliases.
        fx.roomChange(property, departing(exit), room, target, "APPROVED", null);
        UUID move = jdbc.queryForObject("SELECT id FROM tenancy.tenancy_room_change_requests WHERE tenancy_id = ?",
                UUID.class, departing(exit));
        int before = jdbc.queryForObject("SELECT count(*) FROM tenancy.tenancies WHERE property_id = ?", Integer.class, property);
        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
            UUID incoming = fx.monthlyStay(property, room, "SCHEDULED", today.plusDays(8), null);
            jdbc.update("UPDATE tenancy.tenancies SET future_vacancy_source_id = ? WHERE id = ?", move, incoming);
        })).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM tenancy.tenancies WHERE property_id = ?", Integer.class, property))
                .isEqualTo(before);
        assertThat(tenancies.findBookingBed(booking, property).orElseThrow().state()).isEqualTo("WAITING");
        assertThat(reserved()).isZero();
        assertThat(occupied()).isEqualTo(1);
    }

    @Test
    void aFreshLegacyPromiseCannotUseAFreedSourceInsteadOfLiveCapacity() {
        UUID departed = fx.monthlyStay(property, room, "EXITED", today.minusMonths(3), today);
        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
            UUID incoming = fx.monthlyStay(property, room, "SCHEDULED", today.plusDays(8), null);
            jdbc.update("UPDATE tenancy.tenancies SET future_vacancy_tenancy_id = ? WHERE id = ?", departed, incoming);
        })).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM tenancy.bed_holds WHERE property_id = ?", Integer.class, property)).isZero();
        assertThat(reserved()).isZero();
        assertThat(properties.getAvailableVacancies(property, room)).isEqualTo(1);
    }

    @Test
    void bookingAndRoomChangeApprovalShareTheSameLastBed() throws Exception {
        UUID oldRoom = fx.room(property, 1, 1, 0, "OCCUPIED", true);
        UUID stay = fx.monthlyStay(property, oldRoom, "ACTIVE", today.minusMonths(3), null);
        fx.roomChange(property, stay, oldRoom, room, "REQUESTED", null);
        UUID request = jdbc.queryForObject("SELECT id FROM tenancy.tenancy_room_change_requests WHERE tenancy_id = ?", UUID.class, stay);
        jdbc.update("UPDATE tenancy.tenancy_room_change_requests SET effective_transfer_date = ? WHERE id = ?",
                today.plusDays(1), request);
        oneWinner(() -> reserve(UUID.randomUUID(), today.plusDays(8), null),
                () -> roomChanges.approve(owner, request, null));
        assertThat(reserved()).isEqualTo(1);
    }
}
