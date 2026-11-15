package com.khatiyan.a_auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.khatiyan.a_auth.model.OtpDeliveryChannel;
import com.khatiyan.a_auth.model.OtpPurpose;
import com.khatiyan.a_auth.model.OtpRequest;
import com.khatiyan.a_auth.repository.OtpRepository;
import com.khatiyan.c_shared.exception.ServiceUnavailableException;
import com.khatiyan.c_shared.exception.TooManyRequestsException;
import com.khatiyan.c_shared.valkey.ValkeyHealth;

/**
 * Valkey alone limits and holds codes, and while it is down codes are paused
 * (2026-10-18).
 *
 * <p>Until then the database answered the same three rules as a fallback. It
 * kept its own count, so when Valkey came back a code sent during the outage
 * could not be checked, and wrong tries made against the database were
 * forgotten. Pausing is simpler and leaves nothing to reconcile.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OtpServiceRateLimitTest {

    private static final String PHONE = "+919876543110";
    private static final String IP = "203.0.113.7";

    @Mock private OtpRepository otpRepository;
    @Mock private ValkeyOtpStore valkeyOtpStore;
    @Mock private OtpDeliveryService otpDeliveryService;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private OtpSendSchedule sendSchedule;

    private OtpService otpService;

    @BeforeEach
    void setUp() {
        when(passwordEncoder.encode(anyString())).thenReturn("hash");
        otpService = new OtpService(otpRepository, valkeyOtpStore, otpDeliveryService, passwordEncoder,
                new ValkeyHealth(List::of, System::nanoTime), sendSchedule);
    }

    private void issue(String ip) {
        otpService.issue(PHONE, ip, OtpPurpose.CASH_PAYMENT, OtpDeliveryChannel.SMS);
    }

    private void valkeyAllows() {
        when(valkeyOtpStore.startResendCooldown(eq(PHONE), any(), any())).thenReturn(true);
        when(valkeyOtpStore.incrementIpRequestCount(eq(IP), any())).thenReturn(1L);
    }

    private void valkeyIsDown() {
        when(valkeyOtpStore.startResendCooldown(anyString(), any(), any()))
                .thenThrow(new QueryTimeoutException("Valkey unreachable"));
    }

    private void verifyNothingSent() {
        verify(otpDeliveryService, never()).deliverOtp(any(), any(), any(), any(), any(), any());
    }

    // ---- Valkey up: Valkey alone answers ------------------------------------

    @Test
    void whileValkeyIsUpTheDatabaseLimiterIsNeverAsked() {
        valkeyAllows();

        issue(IP);

        verify(otpRepository, never()).countByPhoneAndCreatedAtAfter(anyString(), any());
        verify(otpRepository, never()).countByRequestIpAddressAndCreatedAtAfter(anyString(), any());
        verify(otpRepository, never()).findFirstByPhoneAndPurposeOrderByCreatedAtDesc(anyString(), any());
        verify(otpDeliveryService).deliverOtp(eq(PHONE), any(), anyString(), eq(OtpPurpose.CASH_PAYMENT), any(), any());
    }

    @Test
    void aSecondCodeWithinThirtySecondsIsRefusedWithTheWaitLeft() {
        when(valkeyOtpStore.startResendCooldown(eq(PHONE), eq(OtpPurpose.CASH_PAYMENT), eq(Duration.ofSeconds(30))))
                .thenReturn(false);
        when(valkeyOtpStore.resendCooldownRemainingSeconds(PHONE, OtpPurpose.CASH_PAYMENT)).thenReturn(22L);

        assertThatThrownBy(() -> issue(IP))
                .isInstanceOfSatisfying(TooManyRequestsException.class,
                        refused -> assertThat(refused.retryAfterSeconds()).isEqualTo(22L));
        verifyNothingSent();
    }

    /** A refusal for coming too soon must not also spend the window's allowance. */
    @Test
    void aCooldownRefusalDoesNotCountAgainstTheLimits() {
        when(valkeyOtpStore.startResendCooldown(eq(PHONE), any(), any())).thenReturn(false);

        assertThatThrownBy(() -> issue(IP)).isInstanceOf(TooManyRequestsException.class);

        verify(valkeyOtpStore, never()).incrementIpRequestCount(anyString(), any());
    }

    // ---- The resend schedule (user, 2026-11-14) -------------------------------
    //
    // One code every 30 seconds for the first 20 in a day, then the gap doubles
    // for every further 10: a minute before codes 21-30, two before 31-40, four
    // before 41-50, and so on, never more than a day.

    @Test
    void theServiceUsesTheSchedulesGaps() {
        assertThat(OtpService.resendGapAfter(1)).isEqualTo(Duration.ofSeconds(30));
        assertThat(OtpService.resendGapAfter(3)).isEqualTo(Duration.ofMinutes(1));
        assertThat(OtpService.resendGapAfter(400)).isEqualTo(Duration.ofDays(1));
    }

    /** One device: 20 codes an hour (user, 2026-11-14). It was 20 in five minutes. */
    @Test
    void theDeviceCountRunsOverAnHour() {
        valkeyAllows();

        issue(IP);

        verify(valkeyOtpStore).incrementIpRequestCount(IP, Duration.ofHours(1));
    }

    /** A code an owner asks for is claimed on its own schedule, by the number. */
    @Test
    void aCashCodeIsClaimedOnItsOwnScheduleBeforeItIsSent() {
        valkeyAllows();

        issue(IP);

        verify(sendSchedule).claim(eq("phone:" + PHONE), eq("CASH_PAYMENT"), any());
        verify(otpDeliveryService).deliverOtp(eq(PHONE), any(), anyString(), eq(OtpPurpose.CASH_PAYMENT), any(), any());
    }

    /** A refusal from the schedule sends nothing. */
    @Test
    void aCodeTheScheduleRefusesIsNotSent() {
        valkeyAllows();
        org.mockito.Mockito.doThrow(new TooManyRequestsException("Please wait", 45L))
                .when(sendSchedule).claim(anyString(), anyString(), any());

        assertThatThrownBy(() -> issue(IP))
                .isInstanceOfSatisfying(TooManyRequestsException.class,
                        refused -> assertThat(refused.retryAfterSeconds()).isEqualTo(45L));
        verifyNothingSent();
    }

    /** Sign-in codes were claimed before the account lookup; sending one does not claim twice. */
    @Test
    void aSignInCodeIsNotClaimedAgainWhenSent() {
        valkeyAllows();

        otpService.issue(PHONE, IP, OtpPurpose.LOGIN, OtpDeliveryChannel.SMS);

        verify(sendSchedule, never()).claim(anyString(), anyString(), any());
    }

    /** The old three-in-ten-minutes and five-an-hour windows are no longer asked. */
    @Test
    void theOldWindowsAreNotAsked() {
        valkeyAllows();

        issue(IP);

        verify(valkeyOtpStore, never()).incrementRequestCount(anyString(), any());
        verify(valkeyOtpStore, never()).incrementHourlyRequestCount(anyString(), any());
    }

    /** The per-device limit lives in Valkey now, not only in the database check. */
    @Test
    void theTwentyFirstCodeFromOneDeviceIsRefused() {
        valkeyAllows();
        when(valkeyOtpStore.incrementIpRequestCount(eq(IP), any())).thenReturn(21L);
        when(valkeyOtpStore.ipRequestWindowRemainingSeconds(IP)).thenReturn(300L);

        assertThatThrownBy(() -> issue(IP))
                .isInstanceOf(TooManyRequestsException.class)
                .hasMessageContaining("device");
        verifyNothingSent();
    }

    @Test
    void withNoIpThereIsNoDeviceCount() {
        valkeyAllows();

        issue(null);

        verify(valkeyOtpStore, never()).incrementIpRequestCount(any(), any());
    }

    // ---- Valkey down: codes are paused (2026-10-18) -------------------------

    @Test
    void whenValkeyIsDownACodeIsNotSentAndThePersonIsToldToTryAgainShortly() {
        valkeyIsDown();

        assertThatThrownBy(() -> issue(IP))
                .isInstanceOf(ServiceUnavailableException.class)
                .hasMessage("Codes can't be sent right now. Try again in a few minutes.");
        verifyNothingSent();
        verify(otpRepository, never()).save(any());
    }

    @Test
    void afterAFailureCodesStayPausedWithoutAskingValkeyAgain() {
        valkeyIsDown();
        assertThatThrownBy(() -> issue(IP)).isInstanceOf(ServiceUnavailableException.class);

        assertThatThrownBy(() -> issue(IP)).isInstanceOf(ServiceUnavailableException.class);

        verify(valkeyOtpStore, times(1)).startResendCooldown(anyString(), any(), any());
    }

    @Test
    void whenValkeyIsDownACodeIsNotCheckedForAnyPurpose() {
        when(valkeyOtpStore.findOtp(anyString(), any())).thenThrow(new QueryTimeoutException("Valkey unreachable"));

        for (OtpPurpose purpose : OtpPurpose.values()) {
            assertThatThrownBy(() -> otpService.verifyAndConsumeOTP(PHONE, purpose, "123456"))
                    .isInstanceOf(ServiceUnavailableException.class)
                    .hasMessage("Codes can't be checked right now. Try again in a few minutes.");
            assertThatThrownBy(() -> otpService.verifyOTPWithoutConsuming(PHONE, purpose, "123456"))
                    .isInstanceOf(ServiceUnavailableException.class);
        }
        verify(otpRepository, never()).findLatestUsable(anyString(), any(), any(), anyInt());
    }
}
