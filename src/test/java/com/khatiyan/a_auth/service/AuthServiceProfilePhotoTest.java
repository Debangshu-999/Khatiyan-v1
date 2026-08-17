package com.khatiyan.a_auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.a_auth.model.User;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.a_auth.repository.UserRepository;
import com.khatiyan.c_shared.rate_limit.RateLimitService;

/**
 * The profile photo is tri-state, and getting it wrong loses someone's picture.
 *
 * <p>Null, blank and a URL mean three different things — leave it, clear it,
 * replace it. Collapsing the first two is the easy mistake, and it turns every
 * rename into a silent photo deletion, which nothing reports and nobody
 * notices until they look at their own profile.
 */
@ExtendWith(MockitoExtension.class)
class AuthServiceProfilePhotoTest {

    private static final String EXISTING_URL = "https://cdn.example.com/old.jpg";
    private static final String EXISTING_ID = "khatiyan/profiles/old";

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
                emailVerificationLinkSender,
                recoveryEmailChangeNotifier);
    }

    /** A user who already has a photo, verified and active so the lookup finds them. */
    private UUID givenUserWithAPhoto() {
        User user = User.create("+919000000000", "Old Name", UserRole.USER);
        user.markPhoneVerified();
        user.updateProfilePhoto(EXISTING_URL, EXISTING_ID);
        UUID userId = UUID.randomUUID();
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        return userId;
    }

    /** Renaming sends no photo fields, and must not touch the photo. */
    @Test
    void leavesThePhotoAloneWhenNoneIsSent() {
        UUID userId = givenUserWithAPhoto();

        UserSummaryResponse result = authService.updateProfile(userId, "New Name", null, null);

        assertThat(result.fullName()).isEqualTo("New Name");
        assertThat(result.profilePhotoUrl()).isEqualTo(EXISTING_URL);
    }

    @Test
    void replacesThePhotoWhenAUrlIsSent() {
        UUID userId = givenUserWithAPhoto();

        UserSummaryResponse result =
                authService.updateProfile(userId, "Old Name", "https://cdn.example.com/new.jpg", "khatiyan/profiles/new");

        assertThat(result.profilePhotoUrl()).isEqualTo("https://cdn.example.com/new.jpg");
    }

    /** Blank is the only way to remove a photo, and it must actually remove it. */
    @Test
    void clearsThePhotoWhenBlankIsSent() {
        UUID userId = givenUserWithAPhoto();

        UserSummaryResponse result = authService.updateProfile(userId, "Old Name", "", null);

        assertThat(result.profilePhotoUrl()).isNull();
    }

    /**
     * A URL with no handle still stores the URL. The handle only matters for
     * deleting the old asset later; refusing the save would cost the person
     * their photo over a housekeeping detail.
     */
    @Test
    void storesAUrlEvenWithoutAPublicId() {
        UUID userId = givenUserWithAPhoto();

        UserSummaryResponse result =
                authService.updateProfile(userId, "Old Name", "https://cdn.example.com/new.jpg", "  ");

        assertThat(result.profilePhotoUrl()).isEqualTo("https://cdn.example.com/new.jpg");
    }
}
