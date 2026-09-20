package com.khatiyan.d_modules.servicebalance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.c_shared.exception.BusinessException;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceAccount;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceEntry;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceEntryType;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceReferenceType;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceTopUp;
import com.khatiyan.d_modules.servicebalance.model.ServiceSpendOutcome;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceAccountRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceEntryRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceTopUpRepository;

/**
 * Spending: hold while the work runs, then charge it or let it go.
 *
 * <p>The rule the whole attempts model rests on is here — a hold lasts only as
 * long as one attempt, so granting several costs nothing and an attempt that
 * never happens is never paid for.
 */
@ExtendWith(MockitoExtension.class)
class ServiceBalanceSpendTest {

    private static final long PRICE = 1_500L;

    @Mock
    private ServiceBalanceAccountRepository accountRepository;

    @Mock
    private ServiceBalanceEntryRepository entryRepository;

    @Mock
    private ServiceBalanceTopUpRepository topUpRepository;

    private ServiceBalanceService service;
    private ServiceBalanceProperties properties;
    private UUID ownerUserId;
    private UUID attemptId;
    private ServiceBalanceAccount account;

    @BeforeEach
    void setUp() {
        properties = new ServiceBalanceProperties();
        service = new ServiceBalanceService(accountRepository, entryRepository, topUpRepository, properties);
        ownerUserId = UUID.randomUUID();
        attemptId = UUID.randomUUID();
        account = ServiceBalanceAccount.open(ownerUserId);
    }

    private void accountExists() {
        when(accountRepository.findByOwnerUserId(ownerUserId)).thenReturn(Optional.of(account));
    }

    private ServiceSpendOutcome hold() {
        return service.reserveForService(
                ownerUserId,
                PRICE,
                ServiceBalanceReferenceType.VERIFICATION,
                attemptId,
                "verify:" + attemptId + ":hold",
                "Identity check",
                null);
    }

    private ServiceBalanceEntry savedEntry() {
        ArgumentCaptor<ServiceBalanceEntry> entry = ArgumentCaptor.forClass(ServiceBalanceEntry.class);
        verify(entryRepository).save(entry.capture());
        return entry.getValue();
    }

    @Test
    void aHoldMovesMoneyOutOfSpendableWithoutSpendingIt() {
        account.credit(50_000L);
        accountExists();

        ServiceSpendOutcome outcome = hold();

        assertThat(outcome.reserved()).isTrue();
        assertThat(account.getAvailablePaise()).isEqualTo(48_500L);
        assertThat(account.getReservedPaise()).isEqualTo(PRICE);
        // Still the owner's money until the provider bills us.
        assertThat(account.totalPaise()).isEqualTo(50_000L);
        assertThat(savedEntry().getEntryType()).isEqualTo(ServiceBalanceEntryType.RESERVE);
    }

    @Test
    void anEmptyBalanceStillLetsTheWorkRun() {
        accountExists();

        ServiceSpendOutcome outcome = hold();

        // Stranding a manager mid-onboarding over a few rupees would be a worse
        // product than carrying the charge to the next top-up.
        assertThat(outcome.reserved()).isFalse();
        assertThat(outcome.pricePaise()).isEqualTo(PRICE);
        verify(entryRepository, never()).save(any());
    }

    @Test
    void chargingTakesTheHoldAndStopsThatMoneyBeingRefundable() {
        account.credit(50_000L);
        account.reserve(PRICE);
        accountExists();
        ServiceBalanceTopUp lot = ServiceBalanceTopUp.start(
                account, 50_000L, "RAZORPAY", Instant.now().plus(30, ChronoUnit.MINUTES));
        lot.markPaid("pay_1", Instant.now());
        when(topUpRepository.findByAccountIdAndRemainingRefundablePaiseGreaterThanOrderByCreatedAtAsc(
                        any(), org.mockito.ArgumentMatchers.eq(0L)))
                .thenReturn(List.of(lot));

        service.chargeForService(
                ownerUserId,
                PRICE,
                true,
                ServiceBalanceReferenceType.VERIFICATION,
                attemptId,
                "verify:" + attemptId + ":charge",
                "Identity check",
                null);

        assertThat(account.getReservedPaise()).isZero();
        assertThat(account.getAvailablePaise()).isEqualTo(48_500L);
        // Spent money cannot go back to the card that provided it.
        assertThat(lot.getRemainingRefundablePaise()).isEqualTo(48_500L);
        assertThat(savedEntry().getEntryType()).isEqualTo(ServiceBalanceEntryType.CHARGE);
    }

    @Test
    void chargingWithNoHoldPutsItOnTheTab() {
        accountExists();

        service.chargeForService(
                ownerUserId,
                PRICE,
                false,
                ServiceBalanceReferenceType.VERIFICATION,
                attemptId,
                "verify:" + attemptId + ":charge",
                "Identity check",
                null);

        // The balance never goes negative. The debt is its own number.
        assertThat(account.getAvailablePaise()).isZero();
        assertThat(account.getOutstandingPaise()).isEqualTo(PRICE);
        assertThat(savedEntry().getOutstandingDeltaPaise()).isEqualTo(PRICE);
    }

    @Test
    void workThatNeverRanCostsNothing() {
        account.credit(50_000L);
        account.reserve(PRICE);
        accountExists();

        service.releaseForService(
                ownerUserId,
                PRICE,
                ServiceBalanceReferenceType.VERIFICATION,
                attemptId,
                "verify:" + attemptId + ":release",
                "Hold returned",
                null);

        assertThat(account.getReservedPaise()).isZero();
        assertThat(account.getAvailablePaise()).isEqualTo(50_000L);
        assertThat(savedEntry().getEntryType()).isEqualTo(ServiceBalanceEntryType.RELEASE);
    }

    @Test
    void aRetriedHoldDoesNotHoldTwice() {
        account.credit(50_000L);
        accountExists();
        when(entryRepository.existsByIdempotencyKey(anyString())).thenReturn(true);

        ServiceSpendOutcome outcome = hold();

        assertThat(outcome.reserved()).isTrue();
        assertThat(account.getReservedPaise()).isZero();
        verify(entryRepository, never()).save(any());
    }

    @Test
    void aRetriedChargeDoesNotChargeTwice() {
        when(entryRepository.existsByIdempotencyKey(anyString())).thenReturn(true);

        service.chargeForService(
                ownerUserId,
                PRICE,
                true,
                ServiceBalanceReferenceType.VERIFICATION,
                attemptId,
                "verify:" + attemptId + ":charge",
                "Identity check",
                null);

        verify(entryRepository, never()).save(any());
        verify(accountRepository, never()).save(any());
    }

    @Test
    void duesPastTheCeilingStopFurtherWork() {
        account.chargeToOutstanding(properties.getMaxOutstandingPaise());
        accountExists();

        assertThatThrownBy(this::hold)
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("pending charges");
    }

    @Test
    void aLockedAccountStopsWorkEvenWithMoneyOnIt() {
        account.credit(50_000L);
        account.lock("A payment was reversed by the bank", Instant.now());
        accountExists();

        assertThatThrownBy(this::hold)
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("paused");
    }

    @Test
    void severalAttemptsGrantedCostNothingUntilTheyRun() {
        account.credit(50_000L);
        accountExists();

        // Two attempts granted, one used. The second never holds anything,
        // because a grant is permission rather than money.
        hold();

        assertThat(account.getReservedPaise()).isEqualTo(PRICE);
        assertThat(account.totalPaise()).isEqualTo(50_000L);
    }
}
