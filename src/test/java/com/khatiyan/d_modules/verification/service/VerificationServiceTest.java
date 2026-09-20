package com.khatiyan.d_modules.verification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserIdentityResponse;
import com.khatiyan.c_shared.exception.BusinessException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.servicebalance.ServiceBalanceModule;
import com.khatiyan.d_modules.servicebalance.model.ServiceCode;
import com.khatiyan.d_modules.verification.model.VerificationAttempt;
import com.khatiyan.d_modules.verification.model.VerificationGrant;
import com.khatiyan.d_modules.verification.model.VerificationGrantStatus;
import com.khatiyan.d_modules.verification.provider.AadhaarOkycProvider;
import com.khatiyan.d_modules.verification.provider.DevAadhaarOkycProvider;
import com.khatiyan.d_modules.verification.repository.VerificationAttemptRepository;
import com.khatiyan.d_modules.verification.repository.VerificationGrantRepository;

/**
 * The choreography: who may run a check, when the owner is charged, and what a
 * pass actually establishes.
 *
 * <p>Runs against the dev provider rather than a mock of it. A mock would
 * happily return a name that no real provider would, and the point of these is
 * that the rules hold against something behaving like the real thing.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class VerificationServiceTest {

    private static final long PRICE = 1_500L;
    private static final String AADHAAR = "123456789012";

    /**
     * A transaction manager that just runs the work.
     *
     * <p>The service takes one because it draws its OWN boundaries — every
     * provider call sits between transactions rather than inside one. Nothing
     * here is testing rollback, so this runs each unit inline and the test
     * asserts the choreography around it.
     */
    private static final PlatformTransactionManager RUNS_THE_WORK = new PlatformTransactionManager() {
        @Override
        public TransactionStatus getTransaction(TransactionDefinition definition) {
            return new SimpleTransactionStatus();
        }

        @Override
        public void commit(TransactionStatus status) {
        }

        @Override
        public void rollback(TransactionStatus status) {
        }
    };
    private static final Instant NOW = Instant.parse("2026-09-19T10:00:00Z");

    @Mock
    private VerificationGrantRepository grantRepository;

    @Mock
    private VerificationAttemptRepository attemptRepository;

    @Mock
    private ServiceBalanceModule serviceBalance;

    @Mock
    private AuthModule authModule;

    private VerificationService service;
    private VerificationProperties properties;
    private AadhaarOkycProvider provider;

    private UUID tenancyId;
    private UUID ownerUserId;
    private UUID tenantUserId;
    private VerificationGrant grant;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(NOW, ZoneId.of("Asia/Kolkata"));
        properties = new VerificationProperties();
        properties.setEnabled(true);
        provider = new DevAadhaarOkycProvider(clock, properties.getDevName());
        service = new VerificationService(
                grantRepository,
                attemptRepository,
                provider,
                properties,
                serviceBalance,
                authModule,
                clock,
                RUNS_THE_WORK);

        tenancyId = UUID.randomUUID();
        ownerUserId = UUID.randomUUID();
        tenantUserId = UUID.randomUUID();
        grant = VerificationGrant.order(
                tenancyId, ownerUserId, UUID.randomUUID(), tenantUserId, ServiceCode.AADHAAR_OKYC, 2, ownerUserId);

        when(serviceBalance.priceOf(ServiceCode.AADHAAR_OKYC)).thenReturn(PRICE);
        when(grantRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        when(grantRepository.findById(grant.getId())).thenReturn(Optional.of(grant));

        // An in-memory stand-in rather than a stub per id. The service reads
        // rows back between its transactions now — that IS the fix for holding
        // a connection across a provider call — so a repository that forgets
        // what it saved cannot exercise it.
        Map<UUID, VerificationAttempt> attempts = new HashMap<>();
        when(attemptRepository.save(any())).thenAnswer(call -> {
            VerificationAttempt saved = call.getArgument(0);
            attempts.put(saved.getId(), saved);
            return saved;
        });
        when(attemptRepository.findById(any()))
                .thenAnswer(call -> Optional.ofNullable(attempts.get(call.getArgument(0))));
    }

    private void tenantIsCalled(String fullName) {
        when(authModule.findIdentity(tenantUserId)).thenReturn(Optional.of(new UserIdentityResponse(
                tenantUserId,
                fullName,
                "+919800000002",
                null,
                false,
                "Whatever they typed",
                "700001",
                LocalDate.of(1995, 6, 15),
                null,
                false)));
    }

    private VerificationAttempt startOtp() {
        return service.startOtp(grant.getId(), tenantUserId, AADHAAR);
    }

    // ---- ordering -----------------------------------------------------------

    @Test
    void orderingAsksTheBalanceBeforeCommittingAnything() {
        service.order(
                tenancyId,
                ownerUserId,
                UUID.randomUUID(),
                tenantUserId,
                Map.of(ServiceCode.AADHAAR_OKYC, 3),
                ownerUserId);

        // Three attempts at Rs 15, checked against the owner's limits before a
        // single row is written.
        verify(serviceBalance).ensureCanOrder(eq(ownerUserId), anyLong(), eq(4_500L));
        verify(grantRepository).save(any());
    }

    @Test
    void orderingNothingTouchesNothing() {
        assertThat(service.order(tenancyId, ownerUserId, UUID.randomUUID(), tenantUserId, Map.of(), ownerUserId))
                .isEmpty();

        verify(serviceBalance, never()).ensureCanOrder(any(), anyLong(), anyLong());
    }

    // ---- who may run it -----------------------------------------------------

    /**
     * Somebody else's grant is not found, rather than forbidden. Telling a
     * caller that a verification exists but is not theirs is more than they
     * need to know.
     */
    @Test
    void anotherTenantCannotTouchThisCheck() {
        assertThatThrownBy(() -> service.startOtp(grant.getId(), UUID.randomUUID(), "123456789012"))
                .isInstanceOf(NotFoundException.class);
    }

    // ---- the money ----------------------------------------------------------

    @Test
    void sendingACodeChargesTheOwnerOnce() {
        startOtp();

        verify(serviceBalance)
                .spendForService(eq(ownerUserId), eq(ServiceCode.AADHAAR_OKYC), any(), anyString(), eq(tenantUserId));
    }

    /**
     * The provider refused before doing anything, so there is nothing to pay
     * for AND nothing to charge the tenant a try for.
     *
     * <p>This used to spend the attempt. It was wrong, and a misconfiguration
     * on our side proved it: a purpose string one character over the provider's
     * limit failed every request, and each failure took a try off a tenant who
     * had done nothing. Hammering is held back by the cooldown instead.
     */
    @Test
    void aRefusedRequestCostsNothingAndGivesTheTryBack() {
        assertThatThrownBy(() -> service.startOtp(grant.getId(), tenantUserId, "123456780000"))
                .isInstanceOf(BusinessException.class)
                .extracting(problem -> ((BusinessException) problem).getCode())
                .isEqualTo("VERIFICATION_NO_LINKED_MOBILE");

        verify(serviceBalance, never()).spendForService(any(), any(), any(), anyString(), any());
        assertThat(grant.attemptsRemaining()).isEqualTo(2);
    }

    /** A code that was sent and never used still cost a text message. */
    @Test
    void anAbandonedCodeStillCost() {
        startOtp();

        verify(serviceBalance).spendForService(any(), any(), any(), anyString(), any());
    }

    @Test
    void submittingACodeDoesNotChargeAgain() {
        tenantIsCalled("DEV TEST USER");
        VerificationAttempt attempt = startOtp();

        service.submitOtp(attempt.getId(), tenantUserId, DevAadhaarOkycProvider.FIXED_OTP);

        // Once for the whole attempt, at the moment the message was sent.
        verify(serviceBalance, org.mockito.Mockito.times(1))
                .spendForService(any(), any(), any(), anyString(), any());
    }

    // ---- what a pass establishes -------------------------------------------

    @Test
    void aMatchingNamePassesAndLocksTheIdentity() {
        tenantIsCalled("DEV TEST USER");
        VerificationAttempt attempt = startOtp();

        VerificationResult result = service.submitOtp(attempt.getId(), tenantUserId, DevAadhaarOkycProvider.FIXED_OTP);

        assertThat(result.verified()).isTrue();
        assertThat(grant.getStatus()).isEqualTo(VerificationGrantStatus.VERIFIED);
        // The last four of the number that was actually entered, not a fixed
        // fragment. A stub answering with a constant put a document on the
        // tenancy that belonged to no document anybody had typed.
        assertThat(grant.getMaskedIdLastFour()).isEqualTo(AADHAAR.substring(AADHAAR.length() - 4));
        assertThat(grant.getAdultAtVerification()).isTrue();
        // The record replaces what was typed, and the fields close behind it.
        verify(authModule).applyVerifiedIdentity(
                eq(tenantUserId),
                eq("DEV TEST USER"),
                eq(LocalDate.of(1995, 6, 15)),
                eq("12 Dev Street, Test Locality, Kolkata"),
                eq("700001"),
                eq("AADHAAR_OKYC"),
                any());
    }

    /**
     * The correction that rewrote the matcher. A tenancy whose name is not the
     * one on the document backing it is not verified.
     */
    @Test
    void aNameThatDoesNotMatchFailsAndIsRecorded() {
        tenantIsCalled("DEV TEST");
        VerificationAttempt attempt = startOtp();

        VerificationResult result = service.submitOtp(attempt.getId(), tenantUserId, DevAadhaarOkycProvider.FIXED_OTP);

        assertThat(result.verified()).isFalse();
        assertThat(result.message()).contains("does not match");
        assertThat(grant.getStatus()).isNotEqualTo(VerificationGrantStatus.VERIFIED);
        // Kept, because it is the most useful thing we can tell the owner.
        assertThat(grant.getVerifiedName()).isEqualTo("DEV TEST USER");
        assertThat(grant.getNameMatched()).isFalse();
        verify(authModule, never()).applyVerifiedIdentity(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void aWrongCodeFailsWithoutTouchingTheIdentity() {
        tenantIsCalled("DEV TEST USER");
        VerificationAttempt attempt = startOtp();

        VerificationResult result = service.submitOtp(attempt.getId(), tenantUserId, "000000");

        assertThat(result.verified()).isFalse();
        verify(authModule, never()).applyVerifiedIdentity(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void aMinorCannotHoldATenancy() {
        assertThat(VerificationService.isAdultOn(LocalDate.of(2010, 1, 1), LocalDate.of(2026, 9, 19)))
                .isFalse();
        assertThat(VerificationService.isAdultOn(LocalDate.of(2008, 9, 19), LocalDate.of(2026, 9, 19)))
                .isTrue();
    }

    // ---- gates --------------------------------------------------------------

    @Test
    void aFinishedCheckCannotBeRunAgain() {
        grant.markVerified(
                "DEV TEST USER", LocalDate.of(1995, 6, 15), "4417", null, null, null, null, true, NOW);

        assertThatThrownBy(() -> service.startOtp(grant.getId(), tenantUserId, "123456789012"))
                .isInstanceOf(BusinessException.class)
                .extracting(problem -> ((BusinessException) problem).getCode())
                .isEqualTo("VERIFICATION_CLOSED");
    }

    /**
     * The cap counts CHARGED attempts. A day's allowance is about the owner's
     * money, not about how many times a broken integration was asked.
     */
    @Test
    void aTenantCannotTryMoreTimesThanTheDailyCap() {
        properties.setMaxAttemptsPerDay(1);
        when(attemptRepository.countByGrantIdAndChargedAtNotNullAndStartedAtAfter(eq(grant.getId()), any()))
                .thenReturn(1L);

        assertThatThrownBy(() -> service.startOtp(grant.getId(), tenantUserId, "123456789012"))
                .isInstanceOf(BusinessException.class)
                .extracting(problem -> ((BusinessException) problem).getCode())
                .isEqualTo("VERIFICATION_DAILY_CAP");
    }

    @Test
    void aSecondCodeCannotBeAskedForImmediately() {
        VerificationAttempt open = startOtp();
        when(attemptRepository.findByGrantIdOrderByStartedAtDesc(grant.getId())).thenReturn(List.of(open));

        assertThatThrownBy(() -> service.startOtp(grant.getId(), tenantUserId, "123456789012"))
                .isInstanceOf(BusinessException.class)
                .extracting(problem -> ((BusinessException) problem).getCode())
                .isEqualTo("VERIFICATION_COOLDOWN");
    }

    @Test
    void nothingRunsWhileTheModuleIsOff() {
        properties.setEnabled(false);

        assertThatThrownBy(() -> service.startOtp(grant.getId(), tenantUserId, "123456789012"))
                .isInstanceOf(BusinessException.class)
                .extracting(problem -> ((BusinessException) problem).getCode())
                .isEqualTo("VERIFICATION_DISABLED");
    }

    // ---- signing gate -------------------------------------------------------

    /** An owner who asked for nothing has not blocked their tenant from signing. */
    @Test
    void aTenancyWithNoChecksIsSatisfied() {
        when(grantRepository.findByTenancyIdOrderByCreatedAtAsc(tenancyId)).thenReturn(List.of());

        assertThat(service.isSatisfied(tenancyId)).isTrue();
    }

    @Test
    void aPendingCheckHoldsSigningBack() {
        when(grantRepository.findByTenancyIdOrderByCreatedAtAsc(tenancyId)).thenReturn(List.of(grant));

        assertThat(service.isSatisfied(tenancyId)).isFalse();
    }
}
