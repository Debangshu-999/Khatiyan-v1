package com.khatiyan.d_modules.billing.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;

import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.api.dto.RecordManualPaymentRequest;
import com.khatiyan.d_modules.billing.event.PaymentClaimRaisedEvent;
import com.khatiyan.d_modules.billing.model.BillingCycle;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.billing.model.PaymentIntent;
import com.khatiyan.d_modules.billing.model.PaymentIntentStatus;
import com.khatiyan.d_modules.billing.model.PropertyPaymentDetails;
import com.khatiyan.d_modules.billing.repository.BillingCycleRepository;
import com.khatiyan.d_modules.billing.repository.PaymentIntentRepository;
import com.khatiyan.d_modules.billing.repository.PropertyPaymentDetailsRepository;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

/**
 * Claims raised from a payment method's tab (2026-09-28): only for methods
 * the property takes, and verified under the method the tenant named.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PaymentClaimServiceTest {

    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID PROPERTY = UUID.randomUUID();

    @Mock private PaymentIntentRepository paymentIntentRepository;
    @Mock private PropertyPaymentDetailsRepository paymentDetailsRepository;
    @Mock private BillingCycleRepository billingCycleRepository;
    @Mock private BillingCycleService billingCycleService;
    @Mock private BillingAccessPolicy billingAccessPolicy;
    @Mock private ApplicationEventPublisher eventPublisher;

    @InjectMocks private PaymentIntentService service;

    private BillingCycle tenantsBill() {
        BillingCycle cycle = BillingCycle.create(
                UUID.randomUUID(), "BIL-2026-000240", TENANT, "Kevin Smith", PROPERTY, UUID.randomUUID(),
                TenancyBillingType.MONTHLY, 1,
                LocalDate.of(2026, 9, 28), LocalDate.of(2026, 10, 27), LocalDate.of(2026, 10, 1),
                BillingCollectionTiming.CYCLE_START, 3);
        cycle.recalculateTotals(13_500_00L, 13_500_00L, 0, 0, 0);
        when(billingCycleRepository.findByIdForTenant(cycle.getId(), TENANT)).thenReturn(Optional.of(cycle));
        when(billingCycleRepository.findById(cycle.getId())).thenReturn(Optional.of(cycle));
        return cycle;
    }

    private void takes(ManualPaymentMethod... methods) {
        PropertyPaymentDetails details = PropertyPaymentDetails.empty(PROPERTY);
        details.setAcceptance(Set.of(methods), false);
        when(paymentDetailsRepository.findById(PROPERTY)).thenReturn(Optional.of(details));
    }

    @Test
    void aChequeClaimGoesToTheOwner() {
        takes(ManualPaymentMethod.CASH, ManualPaymentMethod.CHEQUE);
        BillingCycle cycle = tenantsBill();
        when(paymentIntentRepository.save(any(PaymentIntent.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PaymentIntent intent = service.raiseClaim(TENANT, cycle.getId(), ManualPaymentMethod.CHEQUE, "123456", null, List.of());

        assertThat(intent.getStatus()).isEqualTo(PaymentIntentStatus.TENANT_CONFIRMED);
        assertThat(intent.getMethod()).isEqualTo(ManualPaymentMethod.CHEQUE);
        verify(eventPublisher).publishEvent(any(PaymentClaimRaisedEvent.class));
    }

    @Test
    void aClaimForAMethodThePropertyDoesNotTakeIsRefused() {
        takes(ManualPaymentMethod.CASH);
        BillingCycle cycle = tenantsBill();

        assertThatThrownBy(() -> service.raiseClaim(TENANT, cycle.getId(), ManualPaymentMethod.CARD, null, null, List.of()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("does not take");
        verify(paymentIntentRepository, never()).save(any());
    }

    /** Cash is recorded by the owner at the desk, never claimed by the tenant. */
    @Test
    void cashCannotBeClaimed() {
        takes(ManualPaymentMethod.CASH);
        BillingCycle cycle = tenantsBill();

        assertThatThrownBy(() -> service.raiseClaim(TENANT, cycle.getId(), ManualPaymentMethod.CASH, null, null, List.of()))
                .isInstanceOf(ValidationException.class);
    }

    /** Verifying records the payment under the method the tenant named, not always UPI. */
    @Test
    void aVerifiedCardClaimIsRecordedAsCard() {
        BillingCycle cycle = tenantsBill();
        cycle.markConfirmationPending();
        PaymentIntent intent = PaymentIntent.claim(
                cycle.getId(), PROPERTY, cycle.getTenancyId(), TENANT, 13_500_00L, "BIL-2026-000240",
                ManualPaymentMethod.CARD, "A1B2C3", null, List.of());
        when(paymentIntentRepository.findById(intent.getId())).thenReturn(Optional.of(intent));

        service.verifyByOwner(OWNER, intent.getId());

        ArgumentCaptor<RecordManualPaymentRequest> recorded = ArgumentCaptor.forClass(RecordManualPaymentRequest.class);
        verify(billingCycleService).recordManualPayment(eq(OWNER), eq(cycle.getId()), recorded.capture(), isNull(), any());
        assertThat(recorded.getValue().method()).isEqualTo(ManualPaymentMethod.CARD);
    }

    /**
     * The bill card's claims sheet (2026-09-28): one bill's claims, only the
     * states an owner may see, behind the owner-only gate for that bill's
     * property.
     */
    @Test
    void aBillsClaimsAreListedForItsOwnerOnly() {
        BillingCycle cycle = tenantsBill();
        PaymentIntent claim = PaymentIntent.claim(
                cycle.getId(), PROPERTY, cycle.getTenancyId(), TENANT, 13_500_00L, cycle.getReferenceCode(),
                ManualPaymentMethod.CHEQUE, "123456", null, List.of());
        when(paymentIntentRepository.findByBillingCycleIdAndStatusInOrderByCreatedAtDesc(eq(cycle.getId()), any()))
                .thenReturn(List.of(claim));
        when(billingCycleRepository.findAllById(any())).thenReturn(List.of(cycle));

        var claims = service.listClaimsForCycle(OWNER, cycle.getId());

        verify(billingAccessPolicy).ensureOwnsPaymentVerification(OWNER, PROPERTY);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<java.util.Collection<PaymentIntentStatus>> statuses =
                ArgumentCaptor.forClass(java.util.Collection.class);
        verify(paymentIntentRepository)
                .findByBillingCycleIdAndStatusInOrderByCreatedAtDesc(eq(cycle.getId()), statuses.capture());
        assertThat(statuses.getValue()).containsExactlyInAnyOrder(
                PaymentIntentStatus.TENANT_CONFIRMED, PaymentIntentStatus.OWNER_VERIFIED,
                PaymentIntentStatus.OWNER_REJECTED);
        assertThat(claims).singleElement().satisfies(response -> {
            assertThat(response.method()).isEqualTo(ManualPaymentMethod.CHEQUE);
            assertThat(response.tenantName()).isEqualTo("Kevin Smith");
        });
    }
}
