package com.khatiyan.d_modules.servicebalance.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * A top-up is also the refund lot that payment funded.
 *
 * <p>These assertions are what make refunds possible later: money can only go
 * back to the payment that sent it, so a lot that forgets how much of itself is
 * left cannot be refunded at all.
 */
class ServiceBalanceTopUpTest {

    private static final Instant LATER = Instant.now().plus(30, ChronoUnit.MINUTES);

    private ServiceBalanceTopUp startedTopUp(long amountPaise) {
        ServiceBalanceAccount account = ServiceBalanceAccount.open(UUID.randomUUID());
        return ServiceBalanceTopUp.start(account, amountPaise, "RAZORPAY", LATER);
    }

    @Test
    void anUnpaidTopUpFundsNothing() {
        ServiceBalanceTopUp topUp = startedTopUp(50_000L);

        assertThat(topUp.getStatus()).isEqualTo(ServiceBalanceTopUpStatus.CREATED);
        // Nothing has been captured, so there is nothing to refund.
        assertThat(topUp.getRemainingRefundablePaise()).isZero();
    }

    @Test
    void authorisingDoesNotMakeTheMoneyOurs() {
        ServiceBalanceTopUp topUp = startedTopUp(50_000L);

        topUp.markAuthorized("pay_1");

        assertThat(topUp.getStatus()).isEqualTo(ServiceBalanceTopUpStatus.AUTHORIZED);
        assertThat(topUp.getRemainingRefundablePaise()).isZero();
        assertThat(topUp.isPaid()).isFalse();
    }

    @Test
    void capturingMakesTheWholeAmountRefundable() {
        ServiceBalanceTopUp topUp = startedTopUp(50_000L);

        topUp.markPaid("pay_1", Instant.now());

        assertThat(topUp.isPaid()).isTrue();
        assertThat(topUp.getRemainingRefundablePaise()).isEqualTo(50_000L);
    }

    @Test
    void payingTwiceIsIgnoredRatherThanDoublingTheLot() {
        ServiceBalanceTopUp topUp = startedTopUp(50_000L);
        topUp.markPaid("pay_1", Instant.now());
        topUp.consume(20_000L);

        // A redelivered capture webhook must not restore what has been spent.
        topUp.markPaid("pay_1", Instant.now());

        assertThat(topUp.getRemainingRefundablePaise()).isEqualTo(30_000L);
    }

    @Test
    void spendingEatsTheLotAndReportsWhatItCouldTake() {
        ServiceBalanceTopUp topUp = startedTopUp(50_000L);
        topUp.markPaid("pay_1", Instant.now());

        assertThat(topUp.consume(30_000L)).isEqualTo(30_000L);
        assertThat(topUp.getRemainingRefundablePaise()).isEqualTo(20_000L);

        // Asking for more than is left takes what remains and says so, which is
        // how a caller knows to walk on to the next lot.
        assertThat(topUp.consume(25_000L)).isEqualTo(20_000L);
        assertThat(topUp.getRemainingRefundablePaise()).isZero();

        // An empty lot is ordinary, not an error.
        assertThat(topUp.consume(1_000L)).isZero();
    }

    @Test
    void aPaidTopUpCannotBeMarkedFailed() {
        ServiceBalanceTopUp topUp = startedTopUp(50_000L);
        topUp.markPaid("pay_1", Instant.now());

        assertThatThrownBy(() -> topUp.markFailed("late failure"))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void expiringOnlyClosesACheckoutNobodyFinished() {
        ServiceBalanceTopUp paid = startedTopUp(50_000L);
        paid.markPaid("pay_1", Instant.now());
        paid.markExpired();
        assertThat(paid.getStatus()).isEqualTo(ServiceBalanceTopUpStatus.PAID);

        ServiceBalanceTopUp abandoned = startedTopUp(50_000L);
        abandoned.markExpired();
        assertThat(abandoned.getStatus()).isEqualTo(ServiceBalanceTopUpStatus.EXPIRED);
    }

    @Test
    void aClosedTopUpRefusesALatePayment() {
        ServiceBalanceTopUp topUp = startedTopUp(50_000L);
        topUp.markExpired();

        // The gateway returns the uncaptured payment by itself, which is exactly
        // why this refuses rather than quietly accepting.
        assertThatThrownBy(() -> topUp.markAuthorized("pay_late"))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void anAmountIsRequired() {
        ServiceBalanceAccount account = ServiceBalanceAccount.open(UUID.randomUUID());

        assertThatThrownBy(() -> ServiceBalanceTopUp.start(account, 0L, "RAZORPAY", LATER))
                .isInstanceOf(ValidationException.class);
    }
}
