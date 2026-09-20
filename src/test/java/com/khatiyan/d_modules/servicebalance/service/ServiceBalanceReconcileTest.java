package com.khatiyan.d_modules.servicebalance.service;

import static org.assertj.core.api.Assertions.assertThat;
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

import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceAccount;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceReferenceType;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceTopUp;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceTopUpStatus;
import com.khatiyan.d_modules.servicebalance.provider.razorpay.RazorpayTopUpGateway;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceTopUpRepository;

/**
 * Reconciling a checkout against the gateway when the webhook has not arrived.
 *
 * <p>Webhooks are late, dropped, and on a developer machine cannot reach us at
 * all. An owner who has paid should not be left looking at a balance that never
 * moves, so the status read asks the gateway itself.
 *
 * <p>The client never says what happened here — it says only which top-up to
 * look at. Everything credited comes from the gateway's own record.
 */
@ExtendWith(MockitoExtension.class)
class ServiceBalanceReconcileTest {

    @Mock
    private ServiceBalanceService balanceService;

    @Mock
    private ServiceBalanceTopUpRepository topUpRepository;

    @Mock
    private RazorpayTopUpGateway gateway;

    @Mock
    private ServiceBalanceRefundService refundService;

    private ServiceBalanceTopUpService service;
    private UUID ownerUserId;
    private ServiceBalanceTopUp topUp;

    @BeforeEach
    void setUp() {
        service = new ServiceBalanceTopUpService(
                balanceService, topUpRepository, gateway, refundService, new ServiceBalanceProperties());
        ownerUserId = UUID.randomUUID();

        ServiceBalanceAccount account = ServiceBalanceAccount.open(ownerUserId);
        topUp = ServiceBalanceTopUp.start(
                account, 50_000L, "RAZORPAY", Instant.now().plus(30, ChronoUnit.MINUTES));
        topUp.attachOrder("order_1");
    }

    /** Stubbed per test: the sweep paths never look a top-up up by id. */
    private void topUpIsFindableById() {
        when(topUpRepository.findById(topUp.getId())).thenReturn(Optional.of(topUp));
    }

    @Test
    void anAuthorisedPaymentIsCapturedAndCredited() {
        topUpIsFindableById();
        when(gateway.findPaymentForOrder("order_1"))
                .thenReturn(Optional.of(new RazorpayTopUpGateway.OrderPayment("pay_1", 50_000L, "authorized")));

        ServiceBalanceTopUp result = service.read(ownerUserId, topUp.getId());

        // The owner paid. Capturing is the only thing between them and the money.
        verify(gateway).capture("pay_1", 50_000L);
        verify(balanceService).credit(
                eq(ownerUserId),
                eq(50_000L),
                eq(ServiceBalanceReferenceType.TOP_UP),
                eq(topUp.getId()),
                eq("topup:pay_1"),
                anyString(),
                eq(null));
        assertThat(result.getStatus()).isEqualTo(ServiceBalanceTopUpStatus.PAID);
        assertThat(result.getRemainingRefundablePaise()).isEqualTo(50_000L);
    }

    @Test
    void anAlreadyCapturedPaymentIsCreditedWithoutCapturingAgain() {
        topUpIsFindableById();
        when(gateway.findPaymentForOrder("order_1"))
                .thenReturn(Optional.of(new RazorpayTopUpGateway.OrderPayment("pay_1", 50_000L, "captured")));

        service.read(ownerUserId, topUp.getId());

        verify(gateway, never()).capture(anyString(), anyLong());
        verify(balanceService).credit(any(), anyLong(), any(), any(), eq("topup:pay_1"), anyString(), any());
    }

    @Test
    void theSameKeyAsTheWebhookMeansWhicheverArrivesSecondChangesNothing() {
        topUpIsFindableById();
        when(gateway.findPaymentForOrder("order_1"))
                .thenReturn(Optional.of(new RazorpayTopUpGateway.OrderPayment("pay_1", 50_000L, "captured")));

        service.read(ownerUserId, topUp.getId());
        service.read(ownerUserId, topUp.getId());

        // The second read finds it already paid and never asks the gateway again.
        verify(gateway).findPaymentForOrder("order_1");
    }

    @Test
    void nothingIsCreditedWhenTheGatewayHasNoPaymentYet() {
        topUpIsFindableById();
        when(gateway.findPaymentForOrder("order_1")).thenReturn(Optional.empty());

        ServiceBalanceTopUp result = service.read(ownerUserId, topUp.getId());

        verify(balanceService, never()).credit(any(), anyLong(), any(), any(), anyString(), any(), any());
        assertThat(result.getStatus()).isEqualTo(ServiceBalanceTopUpStatus.CREATED);
    }

    @Test
    void anAmountThatDoesNotMatchIsNeverCredited() {
        topUpIsFindableById();
        when(gateway.findPaymentForOrder("order_1"))
                .thenReturn(Optional.of(new RazorpayTopUpGateway.OrderPayment("pay_1", 10_000L, "authorized")));

        service.read(ownerUserId, topUp.getId());

        // Crediting a figure nobody agreed to is worse than crediting nothing,
        // and an uncaptured payment returns itself.
        verify(balanceService, never()).credit(any(), anyLong(), any(), any(), anyString(), any(), any());
        verify(gateway, never()).capture(anyString(), anyLong());
    }

    @Test
    void capturedMoneyWeCannotCreditIsSentBack() {
        topUpIsFindableById();
        when(balanceService.accountFor(any())).thenReturn(ServiceBalanceAccount.open(ownerUserId));
        when(gateway.findPaymentForOrder("order_1"))
                .thenReturn(Optional.of(new RazorpayTopUpGateway.OrderPayment("pay_1", 10_000L, "captured")));

        service.read(ownerUserId, topUp.getId());

        // The money is already ours and cannot be credited, so leaving it would
        // mean quietly keeping a payment nobody can see.
        verify(balanceService, never()).credit(any(), anyLong(), any(), any(), anyString(), any(), any());
        verify(refundService).refundUnappliedPayment(any(), eq(topUp), eq("pay_1"), eq(10_000L));
    }

    @Test
    void aCapturedPaymentForAnUnknownOrderIsSentBack() {
        String body = """
                {
                  "event": "payment.captured",
                  "payload": { "payment": { "entity": {
                    "id": "pay_orphan", "order_id": "order_unknown", "amount": 50000
                  } } }
                }
                """;
        when(gateway.signatureValid(body, "sig")).thenReturn(true);
        when(topUpRepository.findByProviderOrderId("order_unknown")).thenReturn(Optional.empty());

        assertThat(service.handleWebhook(body, "sig")).isEqualTo("unmatched-returned");

        // Holding money we cannot explain is not an option.
        verify(refundService).refundOrphanPayment("pay_orphan", 50_000L);
    }

    @Test
    void openingTheBalanceReconcilesWhatTheAppForgot() {
        // The app holds the pending id in memory, so a reload, a swipe away or
        // a killed process loses it while the money stays very much paid. The
        // balance read must not depend on the client remembering.
        when(topUpRepository.findByOwnerUserIdAndStatusInAndCreatedAtAfter(eq(ownerUserId), any(), any()))
                .thenReturn(List.of(topUp));
        when(gateway.findPaymentForOrder("order_1"))
                .thenReturn(Optional.of(new RazorpayTopUpGateway.OrderPayment("pay_1", 50_000L, "authorized")));

        service.reconcilePendingFor(ownerUserId);

        verify(gateway).capture("pay_1", 50_000L);
        verify(balanceService).credit(any(), anyLong(), any(), any(), eq("topup:pay_1"), anyString(), any());
        assertThat(topUp.getStatus()).isEqualTo(ServiceBalanceTopUpStatus.PAID);
    }

    @Test
    void anAbandonedCheckoutIsNotExpiredWhileItsPaymentIsStillLive() {
        when(topUpRepository.findByStatusAndExpiresAtBefore(eq(ServiceBalanceTopUpStatus.CREATED), any()))
                .thenReturn(List.of(topUp));
        when(gateway.findPaymentForOrder("order_1"))
                .thenReturn(Optional.of(new RazorpayTopUpGateway.OrderPayment("pay_1", 50_000L, "authorized")));

        int expired = service.expireAbandoned();

        // Somebody who paid in the last minute of the window has paid. Writing
        // the row off would stop us capturing money already handed over.
        assertThat(expired).isZero();
        assertThat(topUp.getStatus()).isEqualTo(ServiceBalanceTopUpStatus.PAID);
    }

    @Test
    void aCheckoutWithNoPaymentAtAllIsExpired() {
        when(topUpRepository.findByStatusAndExpiresAtBefore(eq(ServiceBalanceTopUpStatus.CREATED), any()))
                .thenReturn(List.of(topUp));
        when(gateway.findPaymentForOrder("order_1")).thenReturn(Optional.empty());

        assertThat(service.expireAbandoned()).isEqualTo(1);
        assertThat(topUp.getStatus()).isEqualTo(ServiceBalanceTopUpStatus.EXPIRED);
    }

    @Test
    void anUnreachableGatewayLeavesTheStatusReadWorking() {
        topUpIsFindableById();
        when(gateway.findPaymentForOrder("order_1")).thenThrow(new RuntimeException("gateway down"));

        // The webhook may still be on its way, so this must not become an error
        // on a screen that is only asking what happened.
        ServiceBalanceTopUp result = service.read(ownerUserId, topUp.getId());

        assertThat(result.getStatus()).isEqualTo(ServiceBalanceTopUpStatus.CREATED);
    }
}
