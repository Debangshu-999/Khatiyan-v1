package com.khatiyan.a_auth.service;

import java.time.Instant;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.api.dto.OtpVerifyResponse;
import com.khatiyan.a_auth.api.dto.TokenResponse;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.a_auth.event.PinChangedEvent;
import com.khatiyan.a_auth.event.UserRegisteredEvent;
import com.khatiyan.a_auth.model.OtpDeliveryChannel;
import com.khatiyan.a_auth.model.OtpPurpose;
import com.khatiyan.a_auth.model.User;
import com.khatiyan.a_auth.model.LoginFailureReason;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.a_auth.repository.UserRepository;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.rate_limit.RateLimitService;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class AuthService {
    private final UserRepository userRepository;
    private final OtpService otpService;
    private final PinService pinService;
    private final JwtService jwtService;
    private final PhoneNumberNormalizer phoneNumberNormalizer;
    private final ApplicationEventPublisher eventPublisher;
    private final RateLimitService rateLimitService;
    private final LoginRateLimitProperties loginRateLimitProperties;
    private final LoginAttemptService loginAttemptService;

    public AuthService(
            UserRepository userRepository,
            OtpService otpService,
            PinService pinService,
            JwtService jwtService,
            PhoneNumberNormalizer phoneNumberNormalizer,
            ApplicationEventPublisher eventPublisher,
            RateLimitService rateLimitService,
            LoginRateLimitProperties loginRateLimitProperties,
            LoginAttemptService loginAttemptService) {
        this.userRepository = userRepository;
        this.otpService = otpService;
        this.pinService = pinService;
        this.jwtService = jwtService;
        this.phoneNumberNormalizer = phoneNumberNormalizer;
        this.eventPublisher = eventPublisher;
        this.rateLimitService = rateLimitService;
        this.loginRateLimitProperties = loginRateLimitProperties;
        this.loginAttemptService = loginAttemptService;
    }

    private TokenResponse tokenFor(User user) {
        return new TokenResponse(
                jwtService.issue(user),
                "Bearer",
                jwtService.accessTokenExpirySeconds(),
                UserSummaryResponse.from(user));
    }

    private User findActiveByPhone(String phone) {
        String normalizedPhone = phoneNumberNormalizer.normalize(phone);

        return userRepository.findByPhoneAndActiveTrue(normalizedPhone)
                .orElseThrow(() -> new NotFoundException("User_", normalizedPhone));
    }

    private void checkLoginRateLimits(String normalizedPhone) {
        int durationSeconds = (int) Duration.ofMinutes(
                loginRateLimitProperties.phoneLimitDurationMinutes()).toSeconds();

        rateLimitService.consumeOrThrow(
                "rl:auth:login:phone:" + normalizedPhone,
                loginRateLimitProperties.phoneLimitAttempts(),
                durationSeconds,
                "Too many login attempts for this phone. Try again later.");
    }

    /**
     * Creates a self-registered normal user and starts first PIN setup
     * verification.
     */
    @Transactional
    public void registerUser(String phone, String fullName, String requestIpAddress) {
        User user = registerNewAccount(phone, fullName, UserRole.USER);

        otpService.issue(user.getPhone(), requestIpAddress, OtpPurpose.LOGIN, OtpDeliveryChannel.SMS);
    }

    /**
     * Creates a self-registered owner account and starts first PIN setup
     * verification.
     */
    @Transactional
    public void registerOwner(String phone, String fullName, String requestIpAddress) {
        User user = registerNewAccount(phone, fullName, UserRole.OWNER);

        otpService.issue(user.getPhone(), requestIpAddress, OtpPurpose.LOGIN, OtpDeliveryChannel.SMS);
    }

    private User registerNewAccount(String phone, String fullName, UserRole role) {
        String newPhone = phoneNumberNormalizer.normalize(phone);

        if (userRepository.existsByPhoneAndActiveTrue(newPhone)) {
            throw new ValidationException("A user with this phone number already exists");
        }

        User user = User.create(newPhone, fullName.trim(), role);
        userRepository.save(user);

        eventPublisher.publishEvent(new UserRegisteredEvent(
                user.getId(),
                user.getPhone(),
                user.getRole()));

        return user;
    }

    /**
     * Issues an OTP for first PIN setup after registration or provisioning.
     */
    @Transactional
    public void requestPinSetupOTP(String phone, OtpDeliveryChannel channel, String requestIpAddress) {
        User user = findActiveByPhone(phone);

        otpService.issue(user.getPhone(), requestIpAddress, OtpPurpose.LOGIN, channel);
    }

    /**
     * Issues a PIN reset OTP for an existing active user.
     */
    @Transactional
    public void requestPINResetOTP(String phone, OtpDeliveryChannel channel, String requestIpAddress) {
        User user = findActiveByPhone(phone);

        otpService.issue(user.getPhone(), requestIpAddress, OtpPurpose.PIN_RESET, channel);
    }

    /**
     * Checks an OTP without consuming it, so the client can choose the next screen.
     */
    @Transactional
    public OtpVerifyResponse verifyOTP(String phone, String otp, OtpPurpose purpose) {
        User user = findActiveByPhone(phone);

        otpService.verifyOTPWithoutConsuming(user.getPhone(), purpose, otp);

        return new OtpVerifyResponse(
                user.getId(),
                !user.hasPin());
    }

    /**
     * Verifies the first PIN setup OTP, consumes it, stores the first PIN, and
     * returns a JWT.
     */
    @Transactional
    public TokenResponse setPIN(String phone, String otp, String pin) {
        User user = findActiveByPhone(phone);

        if (user.hasPin()) {
            throw new ValidationException("PIN is already set");
        }

        otpService.verifyAndConsumeOTP(user.getPhone(), OtpPurpose.LOGIN, otp);
        user.setPin(pinService.hashPIN(pin));

        eventPublisher.publishEvent(new PinChangedEvent(user.getId()));

        return tokenFor(user);
    }

    /**
     * Authenticates an active user by phone and PIN, returning a JWT on success.
     */
    @Transactional(noRollbackFor = ValidationException.class)
    public TokenResponse loginWithPIN(String phone, String pin, String ipAddress) {
        String normalizedPhone = phoneNumberNormalizer.normalize(phone);

        try {
            checkLoginRateLimits(normalizedPhone);
        } catch (ValidationException exception) {
            loginAttemptService.recordFailure(normalizedPhone, ipAddress, LoginFailureReason.TEMPORARY_RATE_LIMITED);
            throw exception;
        }

        try {
            loginAttemptService.checkDurableWindow(normalizedPhone, ipAddress);
        } catch (ValidationException exception) {
            loginAttemptService.recordFailure(normalizedPhone, ipAddress, LoginFailureReason.DURABLE_RATE_LIMITED);
            throw exception;
        }

        Optional<User> maybeUser = userRepository.findByPhoneAndActiveTrue(normalizedPhone);
        if (maybeUser.isEmpty()) {
            loginAttemptService.recordFailure(normalizedPhone, ipAddress, LoginFailureReason.USER_NOT_FOUND);
            throw new ValidationException("Invalid phone or PIN");
        }

        User user = maybeUser.get();
        if (user.isLoginLocked()) {
            loginAttemptService.recordFailure(normalizedPhone, ipAddress, LoginFailureReason.ACCOUNT_LOCKED);
            throw new ValidationException("Account is locked. Please reset your PIN.");
        }

        Instant now = Instant.now();
        if (!user.hasPin() || !pinService.matches(pin, user.getPinHash())) {
            user.recordFailedLoginAttempt(loginRateLimitProperties.permanentLockFailedAttempts(), now);
            loginAttemptService.recordFailure(normalizedPhone, ipAddress, LoginFailureReason.INVALID_PIN);

            if (user.isLoginLocked()) {
                log.warn(
                        "User login locked after failed attempts userId={} phone={} failedAttempts={}",
                        user.getId(),
                        user.getPhone(),
                        user.getFailedLoginAttempts());
            }
            
            throw new ValidationException("Invalid phone or PIN");
        }

        user.recordSuccessfulLogin(now);
        loginAttemptService.recordSuccess(normalizedPhone, ipAddress);

        return tokenFor(user);
    }

    /**
     * Verifies a PIN reset OTP, consumes it, replaces the PIN, and returns a JWT.
     */
    @Transactional
    public TokenResponse resetPIN(String phone, String otp, String newPin) {
        User user = findActiveByPhone(phone);

        otpService.verifyAndConsumeOTP(user.getPhone(), OtpPurpose.PIN_RESET, otp);
        user.setPin(pinService.hashPIN(newPin));

        eventPublisher.publishEvent(new PinChangedEvent(user.getId()));

        return tokenFor(user);
    }

    /**
     * Finds or creates a manager account for property management assignment.
     */
    @Transactional
    public UUID provisionManagerUser(String phone, String fullName, UUID provisionedBy) {
        String normalizedPhone = phoneNumberNormalizer.normalize(phone);

        Optional<User> existingUser = userRepository.findByPhoneAndActiveTrue(normalizedPhone);
        if (existingUser.isPresent()) {
            User user = existingUser.get();
            if (user.getRole() != UserRole.USER && user.getRole() != UserRole.OWNER) {
                log.warn(
                        "Manager provisioning rejected provisionedBy={} existingUserId={} existingRole={}",
                        provisionedBy,
                        user.getId(),
                        user.getRole());
                throw new ValidationException("Existing user cannot be assigned as manager");
            }

            log.info(
                    "Existing manager user provisioned, provisionedBy={} userId={} role={}",
                    provisionedBy,
                    user.getId(),
                    user.getRole());

            return user.getId();
        }

        User user = User.create(normalizedPhone, fullName.trim(), UserRole.USER);
        userRepository.save(user);

        eventPublisher.publishEvent(new UserRegisteredEvent(
                user.getId(),
                user.getPhone(),
                user.getRole()));

        log.info(
                "New manager user provisioned, provisionedBy={} userId={}",
                provisionedBy,
                user.getId());

        return user.getId();
    }

    /**
     * Finds or creates a normal user account for tenancy creation.
     *
     * <p>
     * This method intentionally does not mark the user as an active tenant. The
     * tenancy module marks that only after the tenancy row is saved, so auth state
     * does not move ahead of the tenancy lifecycle.
     */
    @Transactional
    public UUID provisionTenantUser(String phone, String fullName, UUID provisionedBy) {
        String normalizedPhone = phoneNumberNormalizer.normalize(phone);

        Optional<User> existingUser = userRepository.findByPhoneAndActiveTrue(normalizedPhone);
        if (existingUser.isPresent()) {
            User user = existingUser.get();
            if (user.getRole() != UserRole.USER) {
                log.warn(
                        "Tenant provisioning rejected provisionedBy={} existingUserId={} existingRole={}",
                        provisionedBy,
                        user.getId(),
                        user.getRole());
                throw new ValidationException("This phone number belongs to a non-user account");
            }

            if (user.isActiveTenant()) {
                log.warn(
                        "Tenant provisioning rejected because user is already active tenant provisionedBy={} existingUserId={}",
                        provisionedBy,
                        user.getId());
                throw new ValidationException("User already has an active tenancy");
            }

            log.info(
                    "Existing tenant user provisioned, provisionedBy={} userId={}",
                    provisionedBy,
                    user.getId());

            return user.getId();
        }

        User user = User.create(normalizedPhone, fullName.trim(), UserRole.USER);
        userRepository.save(user);

        eventPublisher.publishEvent(new UserRegisteredEvent(
                user.getId(),
                user.getPhone(),
                user.getRole()));

        log.info(
                "New tenant user provisioned, provisionedBy={} userId={}",
                provisionedBy,
                user.getId());

        return user.getId();
    }

    /**
     * Marks the user as currently attached to an active tenancy after tenancy save.
     */
    @Transactional
    public void markActiveTenant(UUID userId) {
        User user = findActiveUserById(userId)
                .orElseThrow(() -> new NotFoundException("User_", userId));

        user.markActiveTenant();

        log.info("User active tenant flag marked userId={}", user.getId());
    }

    /**
     * Clears the active tenant flag once a user's active tenancy is ended.
     */
    @Transactional
    public void clearActiveTenant(UUID userId) {
        User user = findActiveUserById(userId)
                .orElseThrow(() -> new NotFoundException("User_", userId));

        user.clearActiveTenant();

        log.info("User active tenant flag cleared userId={}", user.getId());
    }

    /**
     * Looks up an active user by id and returns the public auth DTO.
     */
    @Transactional(readOnly = true)
    public Optional<UserSummaryResponse> findById(UUID userId) {
        return userRepository.findById(userId)
                .filter(user -> user.isCurrentlyActive())
                .map(user -> UserSummaryResponse.from(user));
    }

    /**
     * Looks up an active user by phone and returns the public auth DTO.
     */
    @Transactional(readOnly = true)
    public Optional<UserSummaryResponse> findByPhone(String phone) {
        String normalizedPhone = phoneNumberNormalizer.normalize(phone);

        return userRepository.findByPhoneAndActiveTrue(normalizedPhone)
                .map(user -> UserSummaryResponse.from(user));
    }

    /**
     * Updates editable profile details for an active authenticated user.
     */
    @Transactional
    public UserSummaryResponse updateProfile(UUID userId, String fullName) {
        User user = findActiveUserById(userId)
                .orElseThrow(() -> new NotFoundException("User_", userId));

        user.updateProfile(fullName.trim());

        log.info(
                "User profile updated userId={} role={}",
                user.getId(),
                user.getRole());

        return UserSummaryResponse.from(user);
    }

    /**
     * Returns the authenticated user's current profile summary.
     */
    @Transactional(readOnly = true)
    public UserSummaryResponse getProfile(UUID userId) {
        User user = findActiveUserById(userId)
                .orElseThrow(() -> new NotFoundException("User_", userId));

        return UserSummaryResponse.from(user);
    }

    /**
     * Loads the active user entity for internal auth/security checks.
     */
    @Transactional(readOnly = true)
    public Optional<User> findActiveUserById(UUID userId) {
        return userRepository.findById(userId)
                .filter(user -> user.isCurrentlyActive());
    }
}
