package com.khatiyan.d_modules.billing.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.api.dto.ApplyExitPolicyRequest;
import com.khatiyan.d_modules.billing.api.dto.ApplyExitPolicyRequest.CustomCharge;
import com.khatiyan.d_modules.billing.api.dto.ApplyExitPolicyRequest.DamageCharge;
import com.khatiyan.d_modules.billing.api.dto.ApplyExitPolicyRequest.ExitCharge;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.api.dto.CreateExtraChargeRequest;
import com.khatiyan.d_modules.billing.api.dto.CreateOneOffBillRequest;
import com.khatiyan.d_modules.billing.api.dto.ExitChargeInstrument;
import com.khatiyan.d_modules.billing.api.dto.RecordManualPaymentRequest;
import com.khatiyan.d_modules.billing.model.BillingCycleCategory;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.billing.model.DepositAccount;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.billing.repository.DepositAccountRepository;
import com.khatiyan.d_modules.billing.service.DepositManagerService.ExitDeduction;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

/**
 * How the end-tenancy assessment is routed: what goes to the deposit, what goes
 * to a bill, and where the numbers come from.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ExitSettlementServiceTest {

    private static final UUID ACTOR = UUID.randomUUID();
    private static final UUID TENANCY = UUID.randomUUID();
    private static final UUID PROPERTY = UUID.randomUUID();

    @Mock
    private DepositManagerService depositManagerService;
    @Mock
    private BillingCycleService billingCycleService;
    @Mock
    private BillingCycleLineItemService billingCycleLineItemService;
    @Mock
    private DepositAccountRepository depositAccountRepository;

    @InjectMocks
    private ExitSettlementService service;

    private void withDepositAccount() {
        when(depositAccountRepository.findByTenancyId(TENANCY))
                .thenReturn(Optional.of(DepositAccount.open(TENANCY, UUID.randomUUID(), PROPERTY)));
    }

    private void withoutDepositAccount() {
        when(depositAccountRepository.findByTenancyId(TENANCY)).thenReturn(Optional.empty());
    }

    // Records are final, so this is a real response rather than a mock. Only the
    // id is read by the code under test.
    private void stubBill() {
        BillingCycleResponse bill = new BillingCycleResponse(
                UUID.randomUUID(), "BIL-2026-000001", TENANCY, "TEN-2026-000001",
                UUID.randomUUID(), "Test Tenant", PROPERTY, UUID.randomUUID(), "101",
                TenancyBillingType.MONTHLY, BillingCycleCategory.ONE_OFF, 1,
                LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30), LocalDate.of(2026, 6, 4),
                BillingCollectionTiming.CYCLE_START, 3,
                3_000_00, 0, 0, 0L, 0, 3_000_00,
                BillingCycleStatus.UNPAID, null, null, null, List.of());
        when(billingCycleService.createOneOffBill(eq(ACTOR), eq(TENANCY), any())).thenReturn(bill);
    }

    @SuppressWarnings("unchecked")
    private List<ExitDeduction> capturedDeductions() {
        ArgumentCaptor<List<ExitDeduction>> captor = ArgumentCaptor.forClass(List.class);
        verify(depositManagerService).applyExitDeductions(eq(ACTOR), eq(TENANCY), captor.capture(), any(Boolean.class));
        return captor.getValue();
    }

    /**
     * Order is the contract: the payability question the actor answered was asked
     * of the remainder after the early-exit charge, so the server must apply them
     * in that same order.
     */
    @Test
    void appliesTheEarlyExitChargeBeforeDamages() {
        withDepositAccount();
        when(depositManagerService.resolveDamageTotal(PROPERTY, List.of("Broken chair"))).thenReturn(2_000_00L);

        service.applyExitPolicy(ACTOR, TENANCY, PROPERTY, new ApplyExitPolicyRequest(
                List.of(new ExitCharge(3_000_00L, ExitChargeInstrument.DEPOSIT, "One month's rent", null)),
                new DamageCharge(List.of("Broken chair"), null, ExitChargeInstrument.DEPOSIT, null),
                true, null));

        assertThat(capturedDeductions())
                .extracting(ExitDeduction::reason)
                .containsExactly("One month's rent", "Damage charges");
    }

    /** Damage is priced from the property's schedule, never from the client. */
    @Test
    void pricesDamageFromThePropertySchedule() {
        withDepositAccount();
        when(depositManagerService.resolveDamageTotal(PROPERTY, List.of("Broken chair"))).thenReturn(2_000_00L);

        service.applyExitPolicy(ACTOR, TENANCY, PROPERTY, new ApplyExitPolicyRequest(
                null,
                new DamageCharge(List.of("Broken chair"), null, ExitChargeInstrument.DEPOSIT, null),
                true, null));

        assertThat(capturedDeductions())
                .singleElement()
                .extracting(ExitDeduction::amountPaise)
                .isEqualTo(2_000_00L);
    }

    @Test
    void routesBilledChargesToAOneOffBillRecordedPaid() {
        withDepositAccount();
        stubBill();

        service.applyExitPolicy(ACTOR, TENANCY, PROPERTY, new ApplyExitPolicyRequest(
                List.of(new ExitCharge(3_000_00L, ExitChargeInstrument.ONE_OFF_BILL, "One month's rent", null)),
                null,
                true, null));

        ArgumentCaptor<CreateOneOffBillRequest> billed = ArgumentCaptor.forClass(CreateOneOffBillRequest.class);
        verify(billingCycleService).createOneOffBill(eq(ACTOR), eq(TENANCY), billed.capture());
        assertThat(billed.getValue().reason()).isEqualTo("One month's rent");
        assertThat(billed.getValue().amountPaise()).isEqualTo(3_000_00L);

        // Left open, the bill would end the tenancy owing money.
        verify(billingCycleService).recordManualPayment(eq(ACTOR), any(), any(RecordManualPaymentRequest.class));

        assertThat(capturedDeductions()).isEmpty();
    }

    @Test
    void splitsEarlyExitAndDamagesAcrossDifferentInstruments() {
        withDepositAccount();
        stubBill();
        when(depositManagerService.resolveDamageTotal(PROPERTY, List.of("Broken chair"))).thenReturn(2_000_00L);

        service.applyExitPolicy(ACTOR, TENANCY, PROPERTY, new ApplyExitPolicyRequest(
                List.of(new ExitCharge(3_000_00L, ExitChargeInstrument.DEPOSIT, "One month's rent", null)),
                new DamageCharge(List.of("Broken chair"), null, ExitChargeInstrument.ONE_OFF_BILL, null),
                true, null));

        assertThat(capturedDeductions())
                .extracting(ExitDeduction::reason)
                .containsExactly("One month's rent");
        verify(billingCycleService).createOneOffBill(eq(ACTOR), eq(TENANCY), any());
    }

    /**
     * A month's rent of Rs 13,000 against a Rs 10,000 deposit: the deposit takes
     * what it can and the remainder is collected as a bill, rather than forcing
     * the actor to round the figure or skip the deposit entirely.
     */
    @Test
    void splitsOneChargeAcrossDepositAndBillWhenItOutgrowsTheDeposit() {
        withDepositAccount();
        stubBill();

        service.applyExitPolicy(ACTOR, TENANCY, PROPERTY, new ApplyExitPolicyRequest(
                List.of(
                        new ExitCharge(10_000_00L, ExitChargeInstrument.DEPOSIT, "Early exit charge", null),
                        new ExitCharge(3_000_00L, ExitChargeInstrument.ONE_OFF_BILL, "Early exit charge (balance)",
                                ManualPaymentMethod.UPI)),
                null,
                true, null));

        assertThat(capturedDeductions())
                .extracting(ExitDeduction::reason, ExitDeduction::amountPaise)
                .containsExactly(org.assertj.core.api.Assertions.tuple("Early exit charge", 10_000_00L));

        ArgumentCaptor<CreateOneOffBillRequest> billed = ArgumentCaptor.forClass(CreateOneOffBillRequest.class);
        verify(billingCycleService).createOneOffBill(eq(ACTOR), eq(TENANCY), billed.capture());
        assertThat(billed.getValue().amountPaise()).isEqualTo(3_000_00L);
    }

    /** The method is the actor's; a wrong one files a wrong payment record. */
    @Test
    void recordsTheBilledChargeWithTheChosenPaymentMethod() {
        withDepositAccount();
        stubBill();

        service.applyExitPolicy(ACTOR, TENANCY, PROPERTY, new ApplyExitPolicyRequest(
                List.of(new ExitCharge(3_000_00L, ExitChargeInstrument.ONE_OFF_BILL, "Early exit charge",
                        ManualPaymentMethod.UPI)),
                null,
                true, null));

        ArgumentCaptor<RecordManualPaymentRequest> paid = ArgumentCaptor.forClass(RecordManualPaymentRequest.class);
        verify(billingCycleService).recordManualPayment(eq(ACTOR), any(), paid.capture());
        assertThat(paid.getValue().method()).isEqualTo(ManualPaymentMethod.UPI);
    }

    /**
     * The proof photo reaches the payment record.
     *
     * <p>One bill and one payment carry the whole exit however many charges fed
     * into it, so this is the only place the photo can land — and it is the
     * record anyone reconciling the move-out will actually open.
     */
    @Test
    void attachesTheProofPhotoToTheExitPayment() {
        withDepositAccount();
        stubBill();

        service.applyExitPolicy(ACTOR, TENANCY, PROPERTY, new ApplyExitPolicyRequest(
                List.of(new ExitCharge(3_000_00L, ExitChargeInstrument.ONE_OFF_BILL, "Early exit charge",
                        ManualPaymentMethod.UPI)),
                null,
                true,
                "https://cdn.example.com/proof.jpg"));

        ArgumentCaptor<RecordManualPaymentRequest> paid = ArgumentCaptor.forClass(RecordManualPaymentRequest.class);
        verify(billingCycleService).recordManualPayment(eq(ACTOR), any(), paid.capture());
        assertThat(paid.getValue().proofImageUrl()).isEqualTo("https://cdn.example.com/proof.jpg");
    }

    /** An older client that sends no method must not block an exit. */
    @Test
    void fallsBackToCashWhenNoMethodIsGiven() {
        withDepositAccount();
        stubBill();

        service.applyExitPolicy(ACTOR, TENANCY, PROPERTY, new ApplyExitPolicyRequest(
                List.of(new ExitCharge(3_000_00L, ExitChargeInstrument.ONE_OFF_BILL, "Early exit charge", null)),
                null,
                true, null));

        ArgumentCaptor<RecordManualPaymentRequest> paid = ArgumentCaptor.forClass(RecordManualPaymentRequest.class);
        verify(billingCycleService).recordManualPayment(eq(ACTOR), any(), paid.capture());
        assertThat(paid.getValue().method()).isEqualTo(ManualPaymentMethod.CASH);
    }

    @Test
    void includesCustomChargesAlongsideScheduledDamage() {
        withDepositAccount();
        when(depositManagerService.resolveDamageTotal(PROPERTY, List.of("Broken chair"))).thenReturn(2_000_00L);

        service.applyExitPolicy(ACTOR, TENANCY, PROPERTY, new ApplyExitPolicyRequest(
                null,
                new DamageCharge(
                        List.of("Broken chair"),
                        List.of(new CustomCharge("Repainting", 1_500_00L)),
                        ExitChargeInstrument.DEPOSIT, null),
                true, null));

        assertThat(capturedDeductions())
                .extracting(ExitDeduction::reason, ExitDeduction::amountPaise)
                .containsExactly(
                        org.assertj.core.api.Assertions.tuple("Damage charges", 2_000_00L),
                        org.assertj.core.api.Assertions.tuple("Repainting", 1_500_00L));
    }

    /**
     * The tenant hands over one sum at move-out, so the early-exit balance and
     * the damage charge land on ONE bill rather than two.
     */
    @Test
    void mergesEveryBilledChargeIntoASingleBill() {
        withDepositAccount();
        stubBill();
        when(depositManagerService.resolveDamageTotal(PROPERTY, List.of("Broken chair"))).thenReturn(2_000_00L);

        service.applyExitPolicy(ACTOR, TENANCY, PROPERTY, new ApplyExitPolicyRequest(
                List.of(new ExitCharge(3_000_00L, ExitChargeInstrument.ONE_OFF_BILL, "Early exit charge", null)),
                new DamageCharge(List.of("Broken chair"), null, ExitChargeInstrument.ONE_OFF_BILL, null),
                true, null));

        // One bill created, the rest folded in as extra lines on it.
        verify(billingCycleService, org.mockito.Mockito.times(1))
                .createOneOffBill(eq(ACTOR), eq(TENANCY), any());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<CreateExtraChargeRequest>> extras = ArgumentCaptor.forClass(List.class);
        verify(billingCycleLineItemService).addExtraCharge(eq(ACTOR), any(), extras.capture());
        assertThat(extras.getValue())
                .extracting(CreateExtraChargeRequest::label, CreateExtraChargeRequest::amountPaise)
                .containsExactly(org.assertj.core.api.Assertions.tuple("Damage charges", 2_000_00L));

        // Paid once, for the whole bill.
        verify(billingCycleService, org.mockito.Mockito.times(1))
                .recordManualPayment(eq(ACTOR), any(), any(RecordManualPaymentRequest.class));
    }

    /** A daily stay has no deposit; a charge aimed at one would silently vanish. */
    @Test
    void refusesADepositChargeOnAStayWithNoDeposit() {
        withoutDepositAccount();

        assertThatThrownBy(() -> service.applyExitPolicy(ACTOR, TENANCY, PROPERTY, new ApplyExitPolicyRequest(
                null,
                new DamageCharge(null, List.of(new CustomCharge("Repainting", 1_500_00L)),
                        ExitChargeInstrument.DEPOSIT, null),
                null, null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("no deposit");

        verify(depositManagerService, never()).applyExitDeductions(any(), any(), any(), any(Boolean.class));
    }

    @Test
    void billsAgainstAStayWithNoDepositWithoutTouchingTheDepositPath() {
        withoutDepositAccount();
        stubBill();

        service.applyExitPolicy(ACTOR, TENANCY, PROPERTY, new ApplyExitPolicyRequest(
                null,
                new DamageCharge(null, List.of(new CustomCharge("Repainting", 1_500_00L)),
                        ExitChargeInstrument.ONE_OFF_BILL, null),
                null, null));

        verify(billingCycleService).createOneOffBill(eq(ACTOR), eq(TENANCY), any());
        verify(depositManagerService, never()).applyExitDeductions(any(), any(), any(), any(Boolean.class));
    }

    @Test
    void treatsAMissingPayabilityDecisionAsKeepIt() {
        withDepositAccount();

        service.applyExitPolicy(ACTOR, TENANCY, PROPERTY, new ApplyExitPolicyRequest(null, null, null, null));

        verify(depositManagerService).applyExitDeductions(eq(ACTOR), eq(TENANCY), eq(List.of()), eq(true));
    }
}
