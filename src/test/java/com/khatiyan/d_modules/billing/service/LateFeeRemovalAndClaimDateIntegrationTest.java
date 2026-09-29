package com.khatiyan.d_modules.billing.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.analytics.AnalyticsFixtures;
import com.khatiyan.support.IntegrationTest;

import jakarta.persistence.EntityManager;

/**
 * Owner's rules, 2026-09-27: a late fee can be removed only while a bill is
 * overdue, and stays removed; a verified UPI claim is dated when the tenant
 * claimed it, not when the owner verified it.
 */
@IntegrationTest
@Transactional
class LateFeeRemovalAndClaimDateIntegrationTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Asia/Kolkata"));

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BillingCycleService billing;
    @Autowired private PaymentIntentService intents;
    @Autowired private EntityManager entityManager;

    private AnalyticsFixtures fx;
    private UUID p;
    private UUID owner;

    @BeforeEach
    void seed() {
        fx = new AnalyticsFixtures(jdbc);
        p = fx.property(Instant.parse("2026-01-01T00:00:00Z"));
        owner = jdbc.queryForObject("SELECT owner_id FROM property.properties WHERE id = ?", UUID.class, p);
    }

    /** Points a fixture bill at a real stay: the service reads the tenancy behind every bill. */
    private UUID onRealStay(UUID bill, LocalDate start) {
        UUID room = fx.room(p, 2, 1, 0, "PARTIALLY_OCCUPIED", true);
        UUID stay = fx.monthlyStay(p, room, "ACTIVE", start, null);
        jdbc.update("UPDATE billing.billing_cycles SET tenancy_id = ?, room_id = ?, cycle_number = 2 WHERE id = ?", stay, room, bill);
        return stay;
    }

    /** A rent bill due four days ago at Rs 150 a day, charged by the real late-fee run. */
    private UUID overdueBillWithLateFee() {
        LocalDate start = TODAY.minusDays(7);
        UUID bill = fx.cycle(p, "UNPAID", "RENT_CYCLE", start, TODAY.minusDays(4), 3, 1_000_000, 0, 0, null);
        onRealStay(bill, start);
        jdbc.update("UPDATE billing.billing_cycles SET late_fee_per_day_paise = 15000 WHERE id = ?", bill);
        billing.recalculateLateFees(TODAY);
        entityManager.flush();
        entityManager.clear();
        return bill;
    }

    private String status(UUID bill) {
        return jdbc.queryForObject("SELECT status FROM billing.billing_cycles WHERE id = ?", String.class, bill);
    }

    private long total(UUID bill) {
        return jdbc.queryForObject("SELECT total_amount_paise FROM billing.billing_cycles WHERE id = ?", Long.class, bill);
    }

    private long lateFee(UUID bill) {
        return jdbc.queryForObject("SELECT late_fee_amount_paise FROM billing.billing_cycles WHERE id = ?", Long.class, bill);
    }

    @Test
    void removesTheLateFeeFromAnOverdueBillAndItStaysRemoved() {
        UUID bill = overdueBillWithLateFee();
        assertThat(status(bill)).isEqualTo("OVERDUE");
        assertThat(lateFee(bill)).isEqualTo(4 * 15000);
        long totalBefore = total(bill);

        billing.removeLateFee(owner, bill);
        entityManager.flush();
        entityManager.clear();

        assertThat(lateFee(bill)).isZero();
        assertThat(total(bill)).isEqualTo(totalBefore - 4 * 15000);
        assertThat(status(bill)).isEqualTo("OVERDUE");

        // The next nightly run leaves a waived fee alone rather than putting it back.
        billing.recalculateLateFees(TODAY.plusDays(1));
        entityManager.flush();
        entityManager.clear();
        assertThat(lateFee(bill)).isZero();
    }

    @Test
    void refusedWhileAPaymentClaimAwaitsConfirmation() {
        UUID bill = overdueBillWithLateFee();
        jdbc.update("""
                UPDATE billing.billing_cycles SET status = 'CONFIRMATION_PENDING', status_before_confirmation = 'OVERDUE'
                WHERE id = ?
                """, bill);

        assertThatThrownBy(() -> billing.removeLateFee(owner, bill))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("only while the bill is overdue");
    }

    @Test
    void refusedOnAnUnpaidBill() {
        UUID bill = fx.cycle(p, "UNPAID", "RENT_CYCLE", TODAY, TODAY.plusDays(3), 3, 1_000_000, 0, 0, null);

        assertThatThrownBy(() -> billing.removeLateFee(owner, bill))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("only while the bill is overdue");
    }

    @Test
    void aVerifiedClaimIsDatedWhenTheTenantClaimedIt() {
        UUID bill = fx.cycle(p, "UNPAID", "RENT_CYCLE", TODAY.minusDays(5), TODAY.minusDays(2), 3, 1_000_000, 0, 0, null);
        UUID stay = onRealStay(bill, TODAY.minusDays(5));
        UUID intent = fx.paymentIntent(p, bill, "TENANT_CONFIRMED", 1_000_000);
        jdbc.update("UPDATE billing.payment_intents SET tenancy_id = ? WHERE id = ?", stay, intent);
        Instant claimedAt = Instant.now().minus(3, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        jdbc.update("UPDATE billing.payment_intents SET tenant_decided_at = ? WHERE id = ?", Timestamp.from(claimedAt), intent);
        jdbc.update("""
                UPDATE billing.billing_cycles SET status = 'CONFIRMATION_PENDING', status_before_confirmation = 'UNPAID'
                WHERE id = ?
                """, bill);

        intents.verifyByOwner(owner, intent);
        entityManager.flush();

        assertThat(status(bill)).isEqualTo("PAID");
        assertThat(jdbc.queryForObject("SELECT paid_at FROM billing.billing_cycles WHERE id = ?", Timestamp.class, bill)
                .toInstant()).isEqualTo(claimedAt);
        assertThat(jdbc.queryForObject(
                "SELECT collected_at FROM billing.billing_manual_payments WHERE billing_cycle_id = ?", Timestamp.class, bill)
                .toInstant()).isEqualTo(claimedAt);
    }
}
