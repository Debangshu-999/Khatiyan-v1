package com.khatiyan.d_modules.servicebalance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceAccount;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceEntry;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceEntryType;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceReferenceType;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceTopUp;
import com.khatiyan.d_modules.servicebalance.model.ServiceSpendSplit;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceAccountRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceEntryRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceTopUpRepository;

/**
 * Paying for work Khatiyan has already been billed for.
 *
 * <p>Khatiyan prepays the provider, so a check runs whatever the owner's
 * balance says. By the time any of this is called the work is done and the
 * money is gone from OUR account — this balance is not deciding anything, it is
 * recording what the owner used and what they have left.
 *
 * <p>That is why nothing here refuses. The guards that can refuse sit where an
 * owner ORDERS checks, which is a moment where saying no costs nobody a
 * half-finished verification.
 */
@ExtendWith(MockitoExtension.class)
class ServiceBalanceDirectSpendTest {

    private static final long PRICE = 1_500L;

    @Mock
    private ServiceBalanceAccountRepository accountRepository;

    @Mock
    private ServiceBalanceEntryRepository entryRepository;

    @Mock
    private ServiceBalanceTopUpRepository topUpRepository;

    private ServiceBalanceService service;
    private UUID ownerUserId;
    private UUID attemptId;
    private ServiceBalanceAccount account;

    @BeforeEach
    void setUp() {
        service = new ServiceBalanceService(
                accountRepository, entryRepository, topUpRepository, new ServiceBalanceProperties());
        ownerUserId = UUID.randomUUID();
        attemptId = UUID.randomUUID();
        account = ServiceBalanceAccount.open(ownerUserId);
    }

    private void accountExists() {
        when(accountRepository.findByOwnerUserId(ownerUserId)).thenReturn(Optional.of(account));
    }

    private ServiceSpendSplit spend() {
        return service.spendForService(
                ownerUserId,
                PRICE,
                ServiceBalanceReferenceType.VERIFICATION,
                attemptId,
                "verify:" + attemptId + ":charge",
                "Identity check",
                null);
    }

    private ServiceBalanceEntry savedEntry() {
        ArgumentCaptor<ServiceBalanceEntry> entry = ArgumentCaptor.forClass(ServiceBalanceEntry.class);
        verify(entryRepository).save(entry.capture());
        return entry.getValue();
    }

    @Test
    void aSpendComesOutOfTheBalanceAndIsRecordedAsOne() {
        account.credit(50_000L);
        accountExists();

        ServiceSpendSplit split = spend();

        assertThat(split.fromAvailablePaise()).isEqualTo(PRICE);
        assertThat(split.wentOnTheTab()).isFalse();
        assertThat(account.getAvailablePaise()).isEqualTo(48_500L);

        ServiceBalanceEntry entry = savedEntry();
        assertThat(entry.getEntryType()).isEqualTo(ServiceBalanceEntryType.CHARGE);
        assertThat(entry.getAvailableDeltaPaise()).isEqualTo(-PRICE);
        assertThat(entry.getOutstandingDeltaPaise()).isZero();
        // Never from held money: a hold belongs to other work already in flight.
        assertThat(entry.getReservedDeltaPaise()).isZero();
    }

    @Test
    void aSpendWithNothingBehindItBecomesADebt() {
        accountExists();

        ServiceSpendSplit split = spend();

        assertThat(split.fromAvailablePaise()).isZero();
        assertThat(split.toOutstandingPaise()).isEqualTo(PRICE);
        assertThat(account.getOutstandingPaise()).isEqualTo(PRICE);
        assertThat(savedEntry().getOutstandingDeltaPaise()).isEqualTo(PRICE);
    }

    /**
     * The case the old reserved-only charge got wrong. Routing the whole amount
     * to dues because it did not fit would have left the owner looking at money
     * they had already spent, with a debt standing next to it.
     */
    @Test
    void aSpendLargerThanTheBalanceSplitsAcrossOneEntry() {
        account.credit(1_000L);
        accountExists();

        ServiceSpendSplit split = spend();

        assertThat(split.fromAvailablePaise()).isEqualTo(1_000L);
        assertThat(split.toOutstandingPaise()).isEqualTo(500L);

        ServiceBalanceEntry entry = savedEntry();
        assertThat(entry.getAvailableDeltaPaise()).isEqualTo(-1_000L);
        assertThat(entry.getOutstandingDeltaPaise()).isEqualTo(500L);
    }

    /**
     * Only money that actually left the balance can stop being refundable. The
     * part that became a debt was never funded by a payment, so no lot of one
     * may be consumed against it.
     */
    @Test
    void onlyThePartPaidFromTheBalanceConsumesARefundLot() {
        account.credit(1_000L);
        accountExists();
        ServiceBalanceTopUp lot = ServiceBalanceTopUp.start(
                account, 1_000L, "RAZORPAY", java.time.Instant.now().plusSeconds(1_800));
        lot.markPaid("pay_1", java.time.Instant.now());
        when(topUpRepository.findByAccountIdAndRemainingRefundablePaiseGreaterThanOrderByCreatedAtAsc(
                        account.getId(), 0L))
                .thenReturn(List.of(lot));

        spend();

        assertThat(lot.getRemainingRefundablePaise()).isZero();
    }

    @Test
    void aReplayedChargeIsNotAppliedTwice() {
        account.credit(50_000L);
        when(entryRepository.existsByIdempotencyKey("verify:" + attemptId + ":charge")).thenReturn(true);

        ServiceSpendSplit split = spend();

        assertThat(account.getAvailablePaise()).isEqualTo(50_000L);
        assertThat(split.totalPaise()).isEqualTo(PRICE);
        verify(entryRepository, never()).save(any());
    }
}
