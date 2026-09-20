package com.khatiyan.d_modules.servicebalance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceAccountRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceEntryRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceTopUpRepository;

/**
 * Crediting, and the idempotency that makes a retried webhook harmless.
 *
 * <p>Gateways redeliver. They redeliver on timeouts, on 500s, and sometimes for
 * no reason at all, so "the same payment announced twice" is the normal case
 * rather than the exceptional one.
 */
@ExtendWith(MockitoExtension.class)
class ServiceBalanceCreditTest {

    @Mock
    private ServiceBalanceAccountRepository accountRepository;

    @Mock
    private ServiceBalanceEntryRepository entryRepository;

    @Mock
    private ServiceBalanceTopUpRepository topUpRepository;

    private ServiceBalanceService service;
    private UUID ownerUserId;
    private ServiceBalanceAccount account;

    @BeforeEach
    void setUp() {
        service = new ServiceBalanceService(
                accountRepository, entryRepository, topUpRepository, new ServiceBalanceProperties());
        ownerUserId = UUID.randomUUID();
        account = ServiceBalanceAccount.open(ownerUserId);
    }

    /** The owner already has an account. Stubbed per test, never in setup. */
    private void accountExists() {
        when(accountRepository.findByOwnerUserId(ownerUserId)).thenReturn(Optional.of(account));
    }

    @Test
    void creditingRaisesTheBalanceAndWritesOneEntry() {
        accountExists();

        boolean credited = service.credit(
                ownerUserId,
                50_000L,
                ServiceBalanceReferenceType.TOP_UP,
                UUID.randomUUID(),
                "topup:pay_1",
                "Money added",
                null);

        assertThat(credited).isTrue();
        assertThat(account.getAvailablePaise()).isEqualTo(50_000L);

        ArgumentCaptor<ServiceBalanceEntry> entry = ArgumentCaptor.forClass(ServiceBalanceEntry.class);
        verify(entryRepository).save(entry.capture());
        assertThat(entry.getValue().getEntryType()).isEqualTo(ServiceBalanceEntryType.TOPUP);
        assertThat(entry.getValue().getAvailableDeltaPaise()).isEqualTo(50_000L);
        assertThat(entry.getValue().getReservedDeltaPaise()).isZero();
        // Stamped from the account AFTER the move, so the line reads on its own.
        assertThat(entry.getValue().getAvailableAfterPaise()).isEqualTo(50_000L);
    }

    @Test
    void theSamePaymentAnnouncedTwiceCreditsOnce() {
        when(entryRepository.existsByIdempotencyKey("topup:pay_1")).thenReturn(true);

        boolean credited = service.credit(
                ownerUserId,
                50_000L,
                ServiceBalanceReferenceType.TOP_UP,
                UUID.randomUUID(),
                "topup:pay_1",
                "Money added",
                null);

        assertThat(credited).isFalse();
        assertThat(account.getAvailablePaise()).isZero();
        verify(entryRepository, never()).save(any());
        verify(accountRepository, never()).save(any());
    }

    @Test
    void aFirstReadOpensTheAccountRatherThanFailing() {
        UUID freshOwner = UUID.randomUUID();
        when(accountRepository.findByOwnerUserId(freshOwner)).thenReturn(Optional.empty());

        ServiceBalanceAccount opened = service.readAccount(freshOwner);

        assertThat(opened.getOwnerUserId()).isEqualTo(freshOwner);
        assertThat(opened.getAvailablePaise()).isZero();
        // A read must never create a row, so an owner who only looks at the
        // screen leaves nothing behind.
        verify(accountRepository, never()).save(any());
    }

    @Test
    void everyEntryCarriesAnIdempotencyKey() {
        accountExists();

        service.credit(
                ownerUserId,
                10_000L,
                ServiceBalanceReferenceType.TOP_UP,
                UUID.randomUUID(),
                "topup:pay_2",
                null,
                null);

        ArgumentCaptor<ServiceBalanceEntry> entry = ArgumentCaptor.forClass(ServiceBalanceEntry.class);
        verify(entryRepository).save(entry.capture());
        assertThat(entry.getValue().getIdempotencyKey()).isEqualTo("topup:pay_2");
        verify(entryRepository).existsByIdempotencyKey(anyString());
    }
}
