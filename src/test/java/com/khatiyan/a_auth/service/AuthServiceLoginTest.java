package com.khatiyan.a_auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import com.khatiyan.a_auth.api.dto.TokenResponse;
import com.khatiyan.a_auth.model.LoginFailureReason;
import com.khatiyan.a_auth.model.OtpDeliveryChannel;
import com.khatiyan.a_auth.model.OtpPurpose;
import com.khatiyan.a_auth.model.User;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.a_auth.repository.UserRepository;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.rate_limit.RateLimitService;

@ExtendWith(MockitoExtension.class)
class AuthServiceLoginTest {

    private static final String RAW_PHONE = "9007433360";
    private static final String NORMALIZED_PHONE = "+919007433360";
    private static final String IP_ADDRESS = "127.0.0.1";

    @Mock
    private UserRepository userRepository;

    @Mock
    private OtpService otpService;

    @Mock
    private PinService pinService;

    @Mock
    private JwtService jwtService;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Mock
    private RateLimitService rateLimitService;

    @Mock
    private LoginAttemptService loginAttemptService;

    @Mock
    private EmailVerificationLinkSender emailVerificationLinkSender;

    private AuthService authService;
    private LoginRateLimitProperties properties;

    @BeforeEach
    void setUp() {
        properties = new LoginRateLimitProperties();
        properties.setProgressiveLockFailedAttempts(2);
        properties.setProgressiveLockDurationsMinutes(java.util.List.of(5, 15));

        authService = new AuthService(
                userRepository,
                otpService,
                pinService,
                jwtService,
                new PhoneNumberNormalizer(),
                eventPublisher,
                rateLimitService,
                properties,
                loginAttemptService,
                emailVerificationLinkSender);
    }

    @Test
    void unknownPhoneRecordsUserNotFoundFailure() {
        when(userRepository.findByPhoneAndActiveTrue(NORMALIZED_PHONE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.loginWithPIN(RAW_PHONE, "123456", IP_ADDRESS))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Invalid phone or PIN");

        verify(loginAttemptService).checkDurableWindow(NORMALIZED_PHONE, IP_ADDRESS);
        verify(loginAttemptService).recordFailure(
                NORMALIZED_PHONE,
                IP_ADDRESS,
                LoginFailureReason.USER_NOT_FOUND);
    }

    @Test
    void temporaryRateLimitFailureIsRecordedBeforeLookup() {
        doThrow(new ValidationException("Too many login attempts for this phone. Try again later."))
                .when(rateLimitService)
                .consumeOrThrow(
                        "rl:auth:login:phone:" + NORMALIZED_PHONE,
                        properties.phoneLimitAttempts(),
                        properties.phoneLimitDurationMinutes() * 60,
                        "Too many login attempts for this phone. Try again later.");

        assertThatThrownBy(() -> authService.loginWithPIN(RAW_PHONE, "123456", IP_ADDRESS))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Too many login attempts");

        verify(loginAttemptService).recordFailure(
                NORMALIZED_PHONE,
                IP_ADDRESS,
                LoginFailureReason.TEMPORARY_RATE_LIMITED);
        verify(loginAttemptService, never()).checkDurableWindow(NORMALIZED_PHONE, IP_ADDRESS);
        verify(userRepository, never()).findByPhoneAndActiveTrue(NORMALIZED_PHONE);
    }

    @Test
    void durableRateLimitFailureIsRecordedBeforeLookup() {
        doThrow(new ValidationException("Too many login attempts for this phone. Try again later."))
                .when(loginAttemptService)
                .checkDurableWindow(NORMALIZED_PHONE, IP_ADDRESS);

        assertThatThrownBy(() -> authService.loginWithPIN(RAW_PHONE, "123456", IP_ADDRESS))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Too many login attempts");

        verify(loginAttemptService).recordFailure(
                NORMALIZED_PHONE,
                IP_ADDRESS,
                LoginFailureReason.DURABLE_RATE_LIMITED);
        verify(userRepository, never()).findByPhoneAndActiveTrue(NORMALIZED_PHONE);
    }

    @Test
    void invalidPinRecordsFailureAndAppliesTimedLockAtThreshold() {
        User user = userWithPin();
        when(userRepository.findByPhoneAndActiveTrue(NORMALIZED_PHONE)).thenReturn(Optional.of(user));
        when(pinService.matches("111111", "pin-hash")).thenReturn(false);

        assertThatThrownBy(() -> authService.loginWithPIN(RAW_PHONE, "111111", IP_ADDRESS))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Invalid phone or PIN");
        assertThat(user.isLoginLocked()).isFalse();

        assertThatThrownBy(() -> authService.loginWithPIN(RAW_PHONE, "111111", IP_ADDRESS))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Invalid phone or PIN");

        assertThat(user.isLoginLocked()).isTrue();
        assertThat(user.getLoginLockedUntil()).isNotNull();
        assertThat(Duration.between(user.getLoginLockedAt(), user.getLoginLockedUntil())).isEqualTo(Duration.ofMinutes(5));
        assertThat(user.getFailedLoginAttempts()).isEqualTo(2);
        verify(loginAttemptService, times(2)).recordFailure(
                NORMALIZED_PHONE,
                IP_ADDRESS,
                LoginFailureReason.INVALID_PIN);
    }

    @Test
    void temporarilyLockedAccountRecordsAccountLockedFailure() {
        User user = userWithPin();
        user.recordFailedLoginAttempt(1, Duration.ZERO, Instant.parse("2026-06-01T10:00:00Z"));
        user.recordFailedLoginAttempt(2, Duration.ofMinutes(5), Instant.now());
        when(userRepository.findByPhoneAndActiveTrue(NORMALIZED_PHONE)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> authService.loginWithPIN(RAW_PHONE, "123456", IP_ADDRESS))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("temporarily locked");

        verify(loginAttemptService).recordFailure(
                NORMALIZED_PHONE,
                IP_ADDRESS,
                LoginFailureReason.ACCOUNT_LOCKED);
        verify(pinService, never()).matches("123456", "pin-hash");
    }


    @Test
    void expiredLockAllowsSuccessfulLoginAndClearsFailedAttempts() {
        User user = userWithPin();
        user.recordFailedLoginAttempt(1, Duration.ZERO, Instant.parse("2026-06-01T10:00:00Z"));
        user.recordFailedLoginAttempt(2, Duration.ofMinutes(5), Instant.parse("2026-06-01T10:01:00Z"));
        when(userRepository.findByPhoneAndActiveTrue(NORMALIZED_PHONE)).thenReturn(Optional.of(user));
        when(pinService.matches("123456", "pin-hash")).thenReturn(true);
        when(jwtService.issue(user)).thenReturn("jwt-token");
        when(jwtService.accessTokenExpirySeconds()).thenReturn(3600L);

        TokenResponse response = authService.loginWithPIN(RAW_PHONE, "123456", IP_ADDRESS);

        assertThat(response.accessToken()).isEqualTo("jwt-token");
        assertThat(user.isLoginLocked()).isFalse();
        assertThat(user.getFailedLoginAttempts()).isZero();
        assertThat(user.getLoginLockedUntil()).isNull();
        verify(loginAttemptService).recordSuccess(NORMALIZED_PHONE, IP_ADDRESS);
    }

    @Test
    void expiredLockWarnsBeforeNextLockoutBlock() {
        User user = userWithPin();
        user.recordFailedLoginAttempt(1, Duration.ZERO, Instant.parse("2026-06-01T10:00:00Z"));
        user.recordFailedLoginAttempt(2, Duration.ofMinutes(5), Instant.parse("2026-06-01T10:01:00Z"));
        when(userRepository.findByPhoneAndActiveTrue(NORMALIZED_PHONE)).thenReturn(Optional.of(user));
        when(pinService.matches("111111", "pin-hash")).thenReturn(false);

        assertThatThrownBy(() -> authService.loginWithPIN(RAW_PHONE, "111111", IP_ADDRESS))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Account risk detected");

        assertThat(user.isLoginLocked()).isFalse();
        assertThat(user.getFailedLoginAttempts()).isEqualTo(3);
        assertThat(user.getLoginLockedUntil()).isNull();
    }

    @Test
    void nextLockoutAppliesAfterAnotherFullFailedAttemptBlock() {
        User user = userWithPin();
        user.recordFailedLoginAttempt(1, Duration.ZERO, Instant.parse("2026-06-01T10:00:00Z"));
        user.recordFailedLoginAttempt(2, Duration.ofMinutes(5), Instant.parse("2026-06-01T10:01:00Z"));
        user.releaseExpiredLoginLock(Instant.parse("2026-06-01T10:10:00Z"));
        user.recordFailedLoginAttempt(2, Duration.ZERO, Instant.parse("2026-06-01T10:11:00Z"));
        when(userRepository.findByPhoneAndActiveTrue(NORMALIZED_PHONE)).thenReturn(Optional.of(user));
        when(pinService.matches("111111", "pin-hash")).thenReturn(false);

        assertThatThrownBy(() -> authService.loginWithPIN(RAW_PHONE, "111111", IP_ADDRESS))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Account risk detected");

        assertThat(user.isLoginLocked()).isTrue();
        assertThat(user.getFailedLoginAttempts()).isEqualTo(4);
        assertThat(Duration.between(user.getLoginLockedAt(), user.getLoginLockedUntil())).isEqualTo(Duration.ofMinutes(15));
    }
    @Test
    void pinResetRequestIsBlockedWhileLoginLocked() {
        User user = userWithPin();
        user.recordFailedLoginAttempt(1, Duration.ZERO, Instant.parse("2026-06-01T10:00:00Z"));
        user.recordFailedLoginAttempt(2, Duration.ofMinutes(5), Instant.now());
        when(userRepository.findByPhoneAndActiveTrue(NORMALIZED_PHONE)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> authService.requestPINResetOTP(
                RAW_PHONE,
                OtpDeliveryChannel.SMS,
                IP_ADDRESS))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("PIN reset is temporarily unavailable");

        verify(otpService, never()).issue(anyString(), anyString(), any(OtpPurpose.class), any(OtpDeliveryChannel.class));
    }

    @Test
    void pinResetOtpVerificationIsBlockedWhileLoginLocked() {
        User user = userWithPin();
        user.recordFailedLoginAttempt(1, Duration.ZERO, Instant.parse("2026-06-01T10:00:00Z"));
        user.recordFailedLoginAttempt(2, Duration.ofMinutes(5), Instant.now());
        when(userRepository.findByPhoneAndActiveTrue(NORMALIZED_PHONE)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> authService.verifyOTP(RAW_PHONE, "123456", OtpPurpose.PIN_RESET))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("PIN reset is temporarily unavailable");

        verify(otpService, never()).verifyOTPWithoutConsuming(
                NORMALIZED_PHONE,
                OtpPurpose.PIN_RESET,
                "123456");
    }
    @Test
    void pinResetConfirmIsBlockedWhileLoginLocked() {
        User user = userWithPin();
        user.recordFailedLoginAttempt(1, Duration.ZERO, Instant.parse("2026-06-01T10:00:00Z"));
        user.recordFailedLoginAttempt(2, Duration.ofMinutes(5), Instant.now());
        when(userRepository.findByPhoneAndActiveTrue(NORMALIZED_PHONE)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> authService.resetPIN(RAW_PHONE, "123456", "654321"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("PIN reset is temporarily unavailable");

        verify(otpService, never()).verifyAndConsumeOTP(
                NORMALIZED_PHONE,
                OtpPurpose.PIN_RESET,
                "123456");
    }

    @Test
    void successfulLoginRecordsSuccessAndReturnsToken() {
        User user = userWithPin();
        when(userRepository.findByPhoneAndActiveTrue(NORMALIZED_PHONE)).thenReturn(Optional.of(user));
        when(pinService.matches("123456", "pin-hash")).thenReturn(true);
        when(jwtService.issue(user)).thenReturn("jwt-token");
        when(jwtService.accessTokenExpirySeconds()).thenReturn(3600L);

        TokenResponse response = authService.loginWithPIN(RAW_PHONE, "123456", IP_ADDRESS);

        assertThat(response.accessToken()).isEqualTo("jwt-token");
        assertThat(response.user().phone()).isEqualTo(NORMALIZED_PHONE);
        assertThat(user.getLastSuccessfulLoginAt()).isNotNull();
        verify(loginAttemptService).recordSuccess(NORMALIZED_PHONE, IP_ADDRESS);
        verify(loginAttemptService, never()).recordFailure(
                NORMALIZED_PHONE,
                IP_ADDRESS,
                LoginFailureReason.INVALID_PIN);
    }

    private static User userWithPin() {
        User user = User.create(NORMALIZED_PHONE, "Test User", UserRole.USER);
        user.setPin("pin-hash");
        return user;
    }
}
