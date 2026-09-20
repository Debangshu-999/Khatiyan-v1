package com.khatiyan.d_modules.servicebalance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
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
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceAccount;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceRefund;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceRefundReason;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceRefundStatus;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceTopUp;
import com.khatiyan.d_modules.servicebalance.provider.razorpay.RazorpayTopUpGateway;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceAccountRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceEntryRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceRefundRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceTopUpRepository;

/**
 * Money going back to the cards it came from.
 *
 * <p>Two rules run through all of it. Money returns only to the payments that
 * funded it, because any other destination is a withdrawal. And a refund that
 * does not actually leave must put the money back, because an owner who is
 * refused by the gateway and debited by us has simply lost it.
 */
@ExtendWith(MockitoExtension.class)
class ServiceBalanceRefundTest {

    @Mock
    private ServiceBalanceAccountRepository accountRepository;

    @Mock
    private ServiceBalanceEntryRepository entryRepository;

    @Mock
    private ServiceBalanceRefundRepository refundRepository;

    @Mock
    private ServiceBalanceTopUpRepository topUpRepository;

    @Mock
    private RazorpayTopUpGateway gateway;

    private ServiceBalanceRefundService service;
    private UUID ownerUserId;
    private ServiceBalanceAccount account;

    @BeforeEach
    void setUp() {
        service = new ServiceBalanceRefundService(
                accountRepository, entryRepository, refundRepository, topUpRepository, gateway);
        ownerUserId = UUID.randomUUID();
        account = ServiceBalanceAccount.open(ownerUserId);
    }

    /** Only for the paths that actually write a refund row. */
    private void refundsAreSaved() {
        when(refundRepository.save(any())).thenAnswer(call -> call.getArgument(0));
    }

    private ServiceBalanceTopUp paidLot(long amountPaise, String paymentId) {
        ServiceBalanceTopUp lot = ServiceBalanceTopUp.start(
                account, amountPaise, "RAZORPAY", Instant.now().plus(30, ChronoUnit.MINUTES));
        lot.attachOrder("order_" + paymentId);
        lot.markPaid(paymentId, Instant.now());
        return lot;
    }

    private void ownerHasAccount() {
        when(accountRepository.findByOwnerUserId(ownerUserId)).thenReturn(Optional.of(account));
    }

    @Test
    void moneyGoesBackToThePaymentThatFundedIt() {
        refundsAreSaved();
        account.credit(50_000L);
        ownerHasAccount();
        ServiceBalanceTopUp lot = paidLot(50_000L, "pay_1");
        when(topUpRepository.findByAccountIdAndRemainingRefundablePaiseGreaterThanOrderByCreatedAtAsc(
                        any(), eq(0L)))
                .thenReturn(List.of(lot));

        List<UUID> refunds = service.requestRefund(
                ownerUserId, 20_000L, ServiceBalanceRefundReason.UNUSED_BALANCE, ownerUserId);

        assertThat(refunds).hasSize(1);
        assertThat(account.getAvailablePaise()).isEqualTo(30_000L);
        // The lot remembers how much of itself can still go back.
        assertThat(lot.getRemainingRefundablePaise()).isEqualTo(30_000L);
    }

    @Test
    void nothingIsSentBackWhileMoneyIsOwed() {
        account.credit(50_000L);
        account.chargeToOutstanding(4_000L);
        ownerHasAccount();

        assertThatThrownBy(() -> service.requestRefund(
                        ownerUserId, null, ServiceBalanceRefundReason.UNUSED_BALANCE, ownerUserId))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("pending charges");

        // Otherwise an owner could top up, spend, and take the money back out
        // before we collect what they owe.
        verify(gateway, never()).refund(anyString(), anyLong(), anyString());
    }

    @Test
    void heldMoneyCannotBeReturned() {
        account.credit(50_000L);
        account.reserve(10_000L);
        ownerHasAccount();

        assertThatThrownBy(() -> service.requestRefund(
                        ownerUserId, 45_000L, ServiceBalanceRefundReason.UNUSED_BALANCE, ownerUserId))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("at most");
    }

    @Test
    void theGatewayIsCalledOnlyAfterTheRefundIsWrittenDown() {
        refundsAreSaved();
        account.credit(50_000L);
        ownerHasAccount();
        ServiceBalanceTopUp lot = paidLot(50_000L, "pay_1");
        when(topUpRepository.findByAccountIdAndRemainingRefundablePaiseGreaterThanOrderByCreatedAtAsc(
                        any(), eq(0L)))
                .thenReturn(List.of(lot));

        service.requestRefund(ownerUserId, 20_000L, ServiceBalanceRefundReason.UNUSED_BALANCE, ownerUserId);

        // Requesting must not touch the gateway: a second call failing inside
        // the same transaction would roll back a first that had already left.
        verify(gateway, never()).refund(anyString(), anyLong(), anyString());
    }

    @Test
    void aRefusedRefundPutsTheMoneyBack() {
        refundsAreSaved();
        account.credit(50_000L);
        ServiceBalanceTopUp lot = paidLot(50_000L, "pay_1");
        lot.consume(20_000L);
        account.debit(20_000L);

        ServiceBalanceRefund refund = ServiceBalanceRefund.request(
                account, lot, 20_000L, ServiceBalanceRefundReason.UNUSED_BALANCE);
        when(refundRepository.findById(refund.getId())).thenReturn(Optional.of(refund));
        when(accountRepository.findById(account.getId())).thenReturn(Optional.of(account));
        when(topUpRepository.findById(lot.getId())).thenReturn(Optional.of(lot));
        when(gateway.refund(eq("pay_1"), eq(20_000L), anyString()))
                .thenThrow(new RuntimeException("refund window has passed"));

        service.send(refund.getId());

        assertThat(refund.getStatus()).isEqualTo(ServiceBalanceRefundStatus.FAILED);
        // Spendable again, and the lot can carry it once more.
        assertThat(account.getAvailablePaise()).isEqualTo(50_000L);
        assertThat(lot.getRemainingRefundablePaise()).isEqualTo(50_000L);
    }

    @Test
    void aRefundTheGatewayAcceptsIsNotCalledDoneYet() {
        refundsAreSaved();
        ServiceBalanceTopUp lot = paidLot(50_000L, "pay_1");
        account.credit(50_000L);
        ServiceBalanceRefund refund = ServiceBalanceRefund.request(
                account, lot, 20_000L, ServiceBalanceRefundReason.UNUSED_BALANCE);
        when(refundRepository.findById(refund.getId())).thenReturn(Optional.of(refund));
        when(gateway.refund(eq("pay_1"), eq(20_000L), anyString())).thenReturn("rfnd_1");

        service.send(refund.getId());

        // A gateway can accept a refund and refuse it days later, so its
        // webhook is what settles this.
        assertThat(refund.getStatus()).isEqualTo(ServiceBalanceRefundStatus.SENT);
    }

    @Test
    void aRefundThatFailsLaterGivesTheMoneyBack() {
        refundsAreSaved();
        account.credit(30_000L);
        ServiceBalanceTopUp lot = paidLot(50_000L, "pay_1");
        lot.consume(20_000L);
        ServiceBalanceRefund refund = ServiceBalanceRefund.request(
                account, lot, 20_000L, ServiceBalanceRefundReason.UNUSED_BALANCE);
        refund.markSent("rfnd_1");
        when(refundRepository.findByProviderRefundId("rfnd_1")).thenReturn(Optional.of(refund));
        when(accountRepository.findById(account.getId())).thenReturn(Optional.of(account));
        when(topUpRepository.findById(lot.getId())).thenReturn(Optional.of(lot));

        service.applyProviderOutcome("rfnd_1", false, "Card closed");

        assertThat(refund.getStatus()).isEqualTo(ServiceBalanceRefundStatus.FAILED);
        assertThat(account.getAvailablePaise()).isEqualTo(50_000L);
    }

    @Test
    void aSettledRefundIsRecordedAsDone() {
        refundsAreSaved();
        ServiceBalanceTopUp lot = paidLot(50_000L, "pay_1");
        ServiceBalanceRefund refund = ServiceBalanceRefund.request(
                account, lot, 20_000L, ServiceBalanceRefundReason.UNUSED_BALANCE);
        refund.markSent("rfnd_1");
        when(refundRepository.findByProviderRefundId("rfnd_1")).thenReturn(Optional.of(refund));

        service.applyProviderOutcome("rfnd_1", true, null);

        assertThat(refund.getStatus()).isEqualTo(ServiceBalanceRefundStatus.PROCESSED);
        assertThat(refund.getProcessedAt()).isNotNull();
    }

    @Test
    void moneyThatNeverReachedABalanceIsReturnedWithoutTouchingTheLedger() {
        refundsAreSaved();
        ServiceBalanceTopUp lot = paidLot(50_000L, "pay_1");
        when(refundRepository.findByProviderPaymentIdAndReason(
                        "pay_1", ServiceBalanceRefundReason.UNAPPLIED_PAYMENT))
                .thenReturn(Optional.empty());
        when(gateway.refund(eq("pay_1"), eq(50_000L), anyString())).thenReturn("rfnd_unapplied");

        assertThat(service.refundUnappliedPayment(account, lot, "pay_1", 50_000L)).isTrue();

        // Nothing was ever credited, so debiting a balance to give it back
        // would charge the owner for our own failure.
        verify(entryRepository, never()).save(any());
        verify(accountRepository, never()).save(any());
    }

    @Test
    void thatSamePaymentIsNeverReturnedTwice() {
        ServiceBalanceTopUp lot = paidLot(50_000L, "pay_1");
        when(refundRepository.findByProviderPaymentIdAndReason(
                        "pay_1", ServiceBalanceRefundReason.UNAPPLIED_PAYMENT))
                .thenReturn(Optional.of(ServiceBalanceRefund.unapplied(account, lot, "pay_1", 50_000L)));

        assertThat(service.refundUnappliedPayment(account, lot, "pay_1", 50_000L)).isFalse();

        verify(gateway, never()).refund(anyString(), anyLong(), anyString());
    }
}
