package com.khatiyan.d_modules.billing.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.api.dto.ManualPaymentResponse;
import com.khatiyan.d_modules.billing.api.dto.RecordManualPaymentRequest;
import com.khatiyan.d_modules.billing.model.BillingCycle;
import com.khatiyan.d_modules.billing.model.CashPaymentCode;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.billing.model.PropertyPaymentDetails;
import com.khatiyan.d_modules.billing.repository.BillingCycleRepository;
import com.khatiyan.d_modules.billing.repository.CashPaymentCodeRepository;
import com.khatiyan.d_modules.billing.repository.PropertyPaymentDetailsRepository;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

/**
 * Cash is recorded against a bill only with the tenant's code (decided
 * 2026-09-25: strict — no code, no cash).
 *
 * <p>Every test here pins one of the things that make the code mean something:
 * it goes to a number from our own records, it names the amount, it is bound
 * to one bill at one total, and it is spent by being used.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CashPaymentConfirmationServiceTest {

    private static final UUID ACTOR = UUID.randomUUID();
    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID PROPERTY = UUID.randomUUID();
    private static final String TENANT_PHONE = "+919876543110";
    private static final long TOTAL = 21_600_00L;
    private static final String OWNER_IP = "203.0.113.7";

    @Mock private BillingCycleRepository billingCycleRepository;
    @Mock private BillingAccessPolicy billingAccessPolicy;
    @Mock private CashPaymentCodeRepository cashPaymentCodeRepository;
    @Mock private BillingCycleService billingCycleService;
    @Mock private AuthModule authModule;
    @Mock private TenancyModule tenancyModule;
    @Mock private PropertyPaymentDetailsRepository paymentDetailsRepository;

    @InjectMocks private CashPaymentConfirmationService service;

    /** The strict set-up these tests were written for: cash, with the code switched on. */
    @BeforeEach
    void propertyTakesCashWithACode() {
        takes(true, ManualPaymentMethod.CASH);
    }

    /** Which methods the property takes, and whether cash needs the code (2026-09-28). */
    private void takes(boolean cashOtp, ManualPaymentMethod... methods) {
        PropertyPaymentDetails details = PropertyPaymentDetails.empty(PROPERTY);
        if (Set.of(methods).contains(ManualPaymentMethod.UPI)) {
            details.update("owner@okbank", "Asha Roy", "9876543210",
                    "https://res.cloudinary.com/demo/image/upload/qr.png", null, null, null, ACTOR);
        }
        details.setAcceptance(Set.of(methods), cashOtp);
        when(paymentDetailsRepository.findById(PROPERTY)).thenReturn(Optional.of(details));
    }

    private static BillingCycle unpaidBill(UUID tenantUserId) {
        BillingCycle cycle = BillingCycle.create(
                UUID.randomUUID(), "BIL-2026-000234", tenantUserId, "John Stewart", PROPERTY, UUID.randomUUID(),
                TenancyBillingType.MONTHLY, 1,
                LocalDate.of(2026, 9, 18), LocalDate.of(2026, 10, 17), LocalDate.of(2026, 9, 21),
                BillingCollectionTiming.CYCLE_START, 3);
        cycle.recalculateTotals(11_000_00L, 10_000_00L, 0, 600_00L, 0);
        return cycle;
    }

    private BillingCycle stored(BillingCycle cycle) {
        when(billingCycleRepository.findById(cycle.getId())).thenReturn(Optional.of(cycle));
        return cycle;
    }

    private void tenantAccountWithPhone(String phone) {
        when(authModule.findById(TENANT)).thenReturn(Optional.of(new UserSummaryResponse(
                TENANT, phone, null, "John Stewart", null, UserRole.USER,
                true, true, true, false, true)));
    }

    private static RecordManualPaymentRequest cash(String otp) {
        return new RecordManualPaymentRequest(ManualPaymentMethod.CASH, null, List.of(), null, otp);
    }

    private static CashPaymentCode codeSentFor(BillingCycle cycle, long amountPaise, Instant sentAt) {
        return CashPaymentCode.sent(cycle.getId(), amountPaise, TENANT_PHONE, ACTOR, sentAt, Duration.ofMinutes(10));
    }

    private static ManualPaymentResponse recorded(BillingCycle cycle) {
        return new ManualPaymentResponse(
                UUID.randomUUID(), cycle.getId(), cycle.getTenancyId(), TENANT, PROPERTY, TOTAL,
                ManualPaymentMethod.CASH, null, List.of(), null, ACTOR, Instant.now(), Instant.now());
    }

    // ---- sending ------------------------------------------------------------

    @Test
    void theCodeGoesToTheTenantsLoginNumberAndNamesTheAmountAndBill() {
        BillingCycle cycle = stored(unpaidBill(TENANT));
        tenantAccountWithPhone(TENANT_PHONE);
        when(authModule.startCashPaymentConfirmation(anyString(), any(), anyString())).thenReturn("••••3110");
        when(cashPaymentCodeRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.sendCode(ACTOR, cycle.getId(), OWNER_IP);

        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        verify(authModule).startCashPaymentConfirmation(eq(TENANT_PHONE), eq(OWNER_IP), detail.capture());
        assertThat(detail.getValue())
                .as("a tenant must never confirm an amount they did not see")
                .contains("21,600.00")
                .contains("BIL-2026-000234");
        assertThat(response.sentTo()).isEqualTo("••••3110");
        assertThat(response.amountPaise()).isEqualTo(TOTAL);
    }

    @Test
    void theCodeIsBoundToTheBillAtItsCurrentTotal() {
        BillingCycle cycle = stored(unpaidBill(TENANT));
        tenantAccountWithPhone(TENANT_PHONE);
        when(cashPaymentCodeRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service.sendCode(ACTOR, cycle.getId(), OWNER_IP);

        ArgumentCaptor<CashPaymentCode> saved = ArgumentCaptor.forClass(CashPaymentCode.class);
        verify(cashPaymentCodeRepository).save(saved.capture());
        assertThat(saved.getValue().getBillingCycleId()).isEqualTo(cycle.getId());
        assertThat(saved.getValue().getAmountPaise()).isEqualTo(TOTAL);
        assertThat(saved.getValue().getPhone()).isEqualTo(TENANT_PHONE);
    }

    /** A guest stay has no account, so the code goes to the number recorded for the stay. */
    @Test
    void aGuestStaysCodeGoesToTheNumberRecordedForTheStay() {
        BillingCycle cycle = stored(unpaidBill(null));
        TenancyResponse stay = new TenancyResponse(
                cycle.getTenancyId(), "TEN-2026-000300", null, "Walk-in Guest", "+919000011111",
                false, false, PROPERTY, UUID.randomUUID(), ACTOR,
                TenancyBillingType.DAILY, null, null, 1_500_00L,
                LocalDate.of(2026, 9, 24), LocalDate.of(2026, 9, 26), null,
                com.khatiyan.d_modules.tenancy.model.TenancyStatus.ACTIVE,
                Instant.now(), true, true, false, null, null, null, null, null,
                // A guest stay: no account, so the number is the one recorded at check-in.
                true, null, null, null, null);
        when(tenancyModule.findById(cycle.getTenancyId())).thenReturn(Optional.of(stay));
        when(cashPaymentCodeRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service.sendCode(ACTOR, cycle.getId(), OWNER_IP);

        verify(authModule).startCashPaymentConfirmation(eq("+919000011111"), any(), anyString());
    }

    /**
     * The OTP store keeps one live cash code per NUMBER. Sending a code for a
     * tenant's second bill must retire the first bill's, or the second code
     * would pass there too.
     */
    @Test
    void sendingANewCodeRetiresOtherCodesToTheSameNumber() {
        BillingCycle cycle = stored(unpaidBill(TENANT));
        tenantAccountWithPhone(TENANT_PHONE);
        CashPaymentCode forAnotherBill = CashPaymentCode.sent(
                UUID.randomUUID(), 3_000_00L, TENANT_PHONE, ACTOR, Instant.now(), Duration.ofMinutes(10));
        when(cashPaymentCodeRepository.findByPhoneAndConsumedAtIsNullAndExpiresAtAfter(eq(TENANT_PHONE), any()))
                .thenReturn(List.of(forAnotherBill));
        when(cashPaymentCodeRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service.sendCode(ACTOR, cycle.getId(), OWNER_IP);

        assertThat(forAnotherBill.isUsableAt(Instant.now())).isFalse();
    }

    @Test
    void noCodeIsSentForAPaidBill() {
        BillingCycle cycle = stored(unpaidBill(TENANT));
        cycle.markPaid(Instant.now());

        assertThatThrownBy(() -> service.sendCode(ACTOR, cycle.getId(), OWNER_IP))
                .isInstanceOf(ValidationException.class);
        verify(authModule, never()).startCashPaymentConfirmation(anyString(), any(), anyString());
    }

    @Test
    void noCodeIsSentWhenThereIsNoNumberOnRecord() {
        BillingCycle cycle = stored(unpaidBill(TENANT));
        tenantAccountWithPhone(null);

        assertThatThrownBy(() -> service.sendCode(ACTOR, cycle.getId(), OWNER_IP))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("no phone number");
        verify(authModule, never()).startCashPaymentConfirmation(anyString(), any(), anyString());
    }

    // ---- recording ----------------------------------------------------------

    @Test
    void cashIsRecordedWithTheTenantsCodeAndStampedAsConfirmed() {
        BillingCycle cycle = stored(unpaidBill(TENANT));
        CashPaymentCode code = codeSentFor(cycle, TOTAL, Instant.now());
        when(cashPaymentCodeRepository.findFirstByBillingCycleIdOrderByRequestedAtDesc(cycle.getId()))
                .thenReturn(Optional.of(code));
        when(billingCycleService.recordManualPayment(eq(ACTOR), eq(cycle.getId()), any(), any(Instant.class)))
                .thenReturn(recorded(cycle));

        service.record(ACTOR, cycle.getId(), cash("482913"));

        verify(authModule).completeCashPaymentConfirmation(TENANT_PHONE, "482913");
        verify(billingCycleService).recordManualPayment(eq(ACTOR), eq(cycle.getId()), any(), any(Instant.class));
        assertThat(code.isUsableAt(Instant.now()))
                .as("spent by being used — a code that survived could confirm a second payment")
                .isFalse();
    }

    /** Strict: no code, no cash. */
    @Test
    void cashWithoutACodeIsRefused() {
        BillingCycle cycle = stored(unpaidBill(TENANT));

        assertThatThrownBy(() -> service.record(ACTOR, cycle.getId(), cash(null)))
                .isInstanceOf(ValidationException.class);
        verify(billingCycleService, never()).recordManualPayment(any(), any(), any(), any());
        verify(billingCycleService, never()).recordManualPayment(any(), any(), any());
    }

    @Test
    void cashIsRefusedWhenNoCodeWasSent() {
        BillingCycle cycle = stored(unpaidBill(TENANT));
        when(cashPaymentCodeRepository.findFirstByBillingCycleIdOrderByRequestedAtDesc(cycle.getId()))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.record(ACTOR, cycle.getId(), cash("482913")))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Send the tenant");
        verify(billingCycleService, never()).recordManualPayment(any(), any(), any(), any());
    }

    @Test
    void anExpiredCodeIsRefused() {
        BillingCycle cycle = stored(unpaidBill(TENANT));
        when(cashPaymentCodeRepository.findFirstByBillingCycleIdOrderByRequestedAtDesc(cycle.getId()))
                .thenReturn(Optional.of(codeSentFor(cycle, TOTAL, Instant.now().minus(Duration.ofMinutes(11)))));

        assertThatThrownBy(() -> service.record(ACTOR, cycle.getId(), cash("482913")))
                .isInstanceOf(ValidationException.class);
        verify(authModule, never()).completeCashPaymentConfirmation(anyString(), anyString());
    }

    /**
     * The tenant confirmed ₹21,000. A late fee has since made it ₹21,600. They
     * have not agreed to the second number, and the code must not be spent
     * finding that out.
     */
    @Test
    void aCodeSentBeforeTheBillChangedIsRefusedAndNotSpent() {
        BillingCycle cycle = stored(unpaidBill(TENANT));
        CashPaymentCode code = codeSentFor(cycle, 21_000_00L, Instant.now());
        when(cashPaymentCodeRepository.findFirstByBillingCycleIdOrderByRequestedAtDesc(cycle.getId()))
                .thenReturn(Optional.of(code));

        assertThatThrownBy(() -> service.record(ACTOR, cycle.getId(), cash("482913")))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("changed since the code was sent");
        verify(authModule, never()).completeCashPaymentConfirmation(anyString(), anyString());
        verify(billingCycleService, never()).recordManualPayment(any(), any(), any(), any());
    }

    @Test
    void aWrongCodeRecordsNothing() {
        BillingCycle cycle = stored(unpaidBill(TENANT));
        CashPaymentCode code = codeSentFor(cycle, TOTAL, Instant.now());
        when(cashPaymentCodeRepository.findFirstByBillingCycleIdOrderByRequestedAtDesc(cycle.getId()))
                .thenReturn(Optional.of(code));
        doThrow(new ValidationException("OTP is invalid or expired"))
                .when(authModule).completeCashPaymentConfirmation(TENANT_PHONE, "000000");

        assertThatThrownBy(() -> service.record(ACTOR, cycle.getId(), cash("000000")))
                .isInstanceOf(ValidationException.class);
        verify(billingCycleService, never()).recordManualPayment(any(), any(), any(), any());
        assertThat(code.isUsableAt(Instant.now())).as("a wrong guess does not use up the code").isTrue();
    }

    /** UPI, card and cheque carry their own trail and record exactly as before. */
    @Test
    void otherMethodsNeedNoCode() {
        takes(true, ManualPaymentMethod.CASH, ManualPaymentMethod.UPI);
        BillingCycle cycle = stored(unpaidBill(TENANT));
        RecordManualPaymentRequest upi =
                new RecordManualPaymentRequest(ManualPaymentMethod.UPI, "UTR123", List.of(), null);

        service.record(ACTOR, cycle.getId(), upi);

        verify(billingCycleService).recordManualPayment(ACTOR, cycle.getId(), upi);
        verify(authModule, never()).completeCashPaymentConfirmation(anyString(), anyString());
    }

    /** With "Verify cash with OTP" off, cash is recorded like any other method. */
    @Test
    void cashNeedsNoCodeWhenThePropertyHasItOff() {
        takes(false, ManualPaymentMethod.CASH);
        BillingCycle cycle = stored(unpaidBill(TENANT));
        RecordManualPaymentRequest request = cash(null);

        service.record(ACTOR, cycle.getId(), request);

        verify(billingCycleService).recordManualPayment(ACTOR, cycle.getId(), request);
        verify(authModule, never()).completeCashPaymentConfirmation(anyString(), anyString());
    }

    /** Only the ways the property takes money can be recorded, whatever the client sends. */
    @Test
    void aMethodThePropertyDoesNotTakeIsRefused() {
        takes(false, ManualPaymentMethod.CASH);
        BillingCycle cycle = stored(unpaidBill(TENANT));

        assertThatThrownBy(() -> service.record(ACTOR, cycle.getId(),
                new RecordManualPaymentRequest(ManualPaymentMethod.CARD, "123456", List.of(), null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("does not take");
        verify(billingCycleService, never()).recordManualPayment(any(), any(), any());
    }
}
