package com.khatiyan.a_auth.service;

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
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import com.khatiyan.a_auth.api.dto.EmailRecoveryStatusResponse;
import com.khatiyan.a_auth.model.User;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.a_auth.repository.UserRepository;
import com.khatiyan.c_shared.rate_limit.RateLimitService;

/**
 * Changing the recovery address is the takeover move, so it has to be announced.
 *
 * <p>Whoever holds this address can reset the account PIN. An attacker with a
 * session repoints it at themselves and every later message goes to them — the
 * mail to the OUTGOING address is the only one the real owner still receives.
 */
@ExtendWith(MockitoExtension.class)
class AuthServiceRecoveryEmailTest {

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
    private PhoneLoginLockService phoneLoginLockService;

    @Mock
    private UserSessionService userSessionService;

    @Mock
    private DeviceDescriptor deviceDescriptor;

    @Mock
    private EmailVerificationLinkSender emailVerificationLinkSender;

    @Mock
    private RecoveryEmailChangeNotifier recoveryEmailChangeNotifier;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(
                userRepository,
                otpService,
                pinService,
                jwtService,
                new PhoneNumberNormalizer(),
                eventPublisher,
                rateLimitService,
                new LoginRateLimitProperties(),
                loginAttemptService,
                phoneLoginLockService,
                userSessionService,
                deviceDescriptor,
                emailVerificationLinkSender,
                recoveryEmailChangeNotifier);
    }

    private UUID givenUserWith(String email) {
        User user = User.create("+919000000000", "Test User", UserRole.USER);
        if (email != null) {
            user.updateRecoveryEmail(email);
            user.markEmailVerified();
        }
        UUID userId = UUID.randomUUID();
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.findByEmailIgnoreCaseAndActiveTrue(anyString())).thenReturn(Optional.empty());
        return userId;
    }

    /** The outgoing address is told, and told what it was replaced with. */
    @Test
    void notifiesThePreviousAddressWhenTheEmailChanges() {
        UUID userId = givenUserWith("old@example.com");

        authService.updateRecoveryEmail(userId, "new@example.com");

        verify(recoveryEmailChangeNotifier).notifyChanged("old@example.com", "new@example.com");
    }

    /** Nothing is at risk yet, but "was this you?" still needs an audience. */
    @Test
    void notifiesTheNewAddressWhenOneIsSetForTheFirstTime() {
        UUID userId = givenUserWith(null);

        authService.updateRecoveryEmail(userId, "first@example.com");

        verify(recoveryEmailChangeNotifier).notifyChanged(null, "first@example.com");
    }

    /**
     * Re-saving the same address changes nothing, so it warns nobody. A warning
     * that fires when nothing happened is how people learn to ignore the one
     * that matters — and it keeps its verified status.
     */
    @Test
    void staysSilentAndKeepsVerificationWhenTheAddressIsUnchanged() {
        UUID userId = givenUserWith("same@example.com");

        EmailRecoveryStatusResponse result = authService.updateRecoveryEmail(userId, "  Same@Example.com ");

        verify(recoveryEmailChangeNotifier, never()).notifyChanged(any(), any());
        assertThat(result.verified()).isTrue();
        assertThat(result.email()).isEqualTo("same@example.com");
    }

    /** A real change still drops verification — the new address is unproven. */
    @Test
    void reportsTheNewAddressAsUnverifiedAfterAChange() {
        UUID userId = givenUserWith("old@example.com");

        EmailRecoveryStatusResponse result = authService.updateRecoveryEmail(userId, "new@example.com");

        assertThat(result.verified()).isFalse();
        assertThat(result.email()).isEqualTo("new@example.com");
    }
}
