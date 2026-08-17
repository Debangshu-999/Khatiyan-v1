package com.khatiyan.a_auth.service;

import java.time.Instant;
import java.time.Duration;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Collection;
import java.util.Collections;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.api.dto.EmailRecoveryStatusResponse;
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
    private final EmailVerificationLinkSender emailVerificationLinkSender;
    private final RecoveryEmailChangeNotifier recoveryEmailChangeNotifier;

    public AuthService(
            UserRepository userRepository,
            OtpService otpService,
            PinService pinService,
            JwtService jwtService,
            PhoneNumberNormalizer phoneNumberNormalizer,
            ApplicationEventPublisher eventPublisher,
            RateLimitService rateLimitService,
            LoginRateLimitProperties loginRateLimitProperties,
            LoginAttemptService loginAttemptService,
            EmailVerificationLinkSender emailVerificationLinkSender,
            RecoveryEmailChangeNotifier recoveryEmailChangeNotifier) {
        this.userRepository = userRepository;
        this.otpService = otpService;
        this.pinService = pinService;
        this.jwtService = jwtService;
        this.phoneNumberNormalizer = phoneNumberNormalizer;
        this.eventPublisher = eventPublisher;
        this.rateLimitService = rateLimitService;
        this.loginRateLimitProperties = loginRateLimitProperties;
        this.loginAttemptService = loginAttemptService;
        this.emailVerificationLinkSender = emailVerificationLinkSender;
        this.recoveryEmailChangeNotifier = recoveryEmailChangeNotifier;
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
                .orElseThrow(() -> new NotFoundException("User", normalizedPhone));
    }

    private User findActiveByEmail(String email) {
        return userRepository.findByEmailIgnoreCaseAndActiveTrue(normalizeEmail(email))
                .orElseThrow(() -> new NotFoundException("User", email));
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }

    private void ensureVerifiedEmail(User user) {
        if (user.getEmail() == null || user.getEmail().isBlank() || !user.isEmailVerified()) {
            throw new ValidationException("Verify your email before using email login or PIN reset");
        }
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
    public void registerUser(String phone, String email, String fullName, String requestIpAddress) {
        String normalizedPhone = phoneNumberNormalizer.normalize(phone);

        // A provisioned tenant already has a USER account but no PIN. Let them
        // "sign up" by resuming first PIN setup instead of erroring, optionally
        // upgrading their placeholder name to the one they provided.
        Optional<User> existing = userRepository.findByPhoneAndActiveTrue(normalizedPhone);
        if (existing.isPresent()) {
            User user = existing.get();
            if (user.getRole() == UserRole.USER && !user.hasPin()) {
                // Resume first PIN setup for a provisioned, not-yet-activated
                // tenant. The user-submitted signup name becomes the final
                // profile name before PIN setup completes.
                user.updateProfile(fullName.trim());
                if (email != null && !email.isBlank()) {
                    user.updateRecoveryEmail(email);
                }
                // Tenant creation is SMS-only: no email OTP (email is optional and
                // set later in profile).
                otpService.issue(user.getPhone(), requestIpAddress, OtpPurpose.LOGIN, OtpDeliveryChannel.SMS);
                return;
            }
            throw new ValidationException("A user with this phone number already exists");
        }

        User user = registerNewAccount(phone, email, fullName, UserRole.USER);
        otpService.issue(user.getPhone(), requestIpAddress, OtpPurpose.LOGIN, OtpDeliveryChannel.SMS);
    }

    /**
     * Creates a self-registered owner account and starts first PIN setup
     * verification.
     */
    @Transactional
    public void registerOwner(String phone, String email, String fullName, String requestIpAddress) {
        User user = registerNewAccount(phone, email, fullName, UserRole.OWNER);

        otpService.issue(user.getPhone(), user.getEmail(), requestIpAddress, OtpPurpose.LOGIN, OtpDeliveryChannel.SMS_AND_EMAIL);
    }

    private User registerNewAccount(String phone, String email, String fullName, UserRole role) {
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
        String normalizedPhone = phoneNumberNormalizer.normalize(phone);
        Optional<User> found = userRepository.findByPhoneAndActiveTrue(normalizedPhone);

        // Deliberately silent in both refusal cases, and deliberately NOT a
        // 404 or a "you already have a PIN" error.
        //
        // A caller who gets a different answer per number can walk a range and
        // learn which ones hold accounts, and which of those are still waiting
        // to be set up — an unclaimed account is exactly what an attacker wants
        // to find. Every outcome here returns 202, so the response says nothing
        // about the number. The person who really owns it learns the difference
        // from the SMS arriving or not.
        //
        // The has-PIN case also stops a real bug: without it, anyone could make
        // us text a setup code to an account that is already set up, and the
        // holder would only discover the dead end after typing the code, since
        // setPIN refuses them at the end.
        if (found.isEmpty()) {
            log.info("PIN setup OTP skipped: no active account for that number");
            return;
        }

        User user = found.get();
        if (user.hasPin()) {
            // Told plainly, unlike the not-found case. The two bits are not
            // worth the same: "this number is waiting to be set up" is what an
            // attacker wants, because an unclaimed account is the one worth
            // social-engineering an OTP out of. "This number is already set up"
            // buys them nothing and saves a real person from waiting on an SMS
            // that is never coming.
            log.info("PIN setup OTP refused userId={} reason=pin-already-set", user.getId());
            throw new ValidationException("This number is already set up.");
        }

        otpService.issue(user.getPhone(), requestIpAddress, OtpPurpose.LOGIN, channel);
    }

    /**
     * Issues a PIN reset OTP for an existing active user.
     */
    @Transactional
    public void requestPINResetOTP(String phone, OtpDeliveryChannel channel, String requestIpAddress) {
        String normalizedPhone = phoneNumberNormalizer.normalize(phone);
        Optional<User> found = userRepository.findByPhoneAndActiveTrue(normalizedPhone);

        // Same uniform-response rule as requestPinSetupOTP: every outcome is a
        // silent 202, so the answer never reveals whether a number holds an
        // account. Reset has the identical shape — an unregistered number and a
        // registered one must be indistinguishable to the caller.
        //
        // The lock case is silent too. It looks like useful feedback, but only a
        // real account can ever be locked, so returning it would hand back the
        // exact bit the rest of this is hiding. Someone genuinely locked out
        // already knows they have been failing sign-in.
        if (found.isEmpty()) {
            log.info("PIN reset OTP skipped: no active account for that number");
            return;
        }

        User user = found.get();
        user.releaseExpiredLoginLock(Instant.now());
        if (user.isLoginTemporarilyLocked(Instant.now())) {
            log.info("PIN reset OTP skipped userId={} reason=login-locked", user.getId());
            return;
        }

        otpService.issue(user.getPhone(), requestIpAddress, OtpPurpose.PIN_RESET, channel);
    }

    /**
     * Checks an OTP without consuming it, so the client can choose the next screen.
     */
    @Transactional
    public EmailRecoveryStatusResponse emailRecoveryStatus(UUID userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> new NotFoundException("User", userId));
        return new EmailRecoveryStatusResponse(user.getEmail(), user.isEmailVerified());
    }

    @Transactional
    public EmailRecoveryStatusResponse updateRecoveryEmail(UUID userId, String email) {
        User user = userRepository.findById(userId).orElseThrow(() -> new NotFoundException("User", userId));
        String normalizedEmail = normalizeEmail(email);
        Optional<User> existing = userRepository.findByEmailIgnoreCaseAndActiveTrue(normalizedEmail);
        if (existing.isPresent() && !existing.get().getId().equals(userId)) {
            throw new ValidationException("A user with this email address already exists");
        }
        String previousEmail = user.getEmail();
        user.updateRecoveryEmail(normalizedEmail);

        // Only on a real change. Re-saving the address already on file is a
        // no-op, and mailing "your recovery email changed" when it did not is
        // how people learn to ignore the one warning that matters.
        if (!Objects.equals(previousEmail, user.getEmail())) {
            recoveryEmailChangeNotifier.notifyChanged(previousEmail, user.getEmail());
        }

        // Read the flag back rather than assuming it was cleared. Re-saving the
        // address already on file leaves verification intact, and a hardcoded
        // false told the screen otherwise — so a no-op save still looked like it
        // had lost the verification even once the model stopped doing that.
        return new EmailRecoveryStatusResponse(user.getEmail(), user.isEmailVerified());
    }
    @Transactional
    public void requestEmailVerification(UUID userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> new NotFoundException("User", userId));
        if (user.getEmail() == null || user.getEmail().isBlank()) {
            throw new ValidationException("Add an email address before requesting verification");
        }
        if (user.isEmailVerified()) {
            return;
        }
        String token = newVerificationToken();
        user.beginEmailVerification(hashToken(token), Instant.now().plus(30, ChronoUnit.MINUTES));
        emailVerificationLinkSender.send(user.getEmail(), token);
    }

    @Transactional
    public boolean verifyEmail(String token) {
        if (token == null || token.isBlank()) return false;
        String hash = hashToken(token);
        User user = userRepository.findByEmailVerificationTokenHash(hash).orElse(null);
        if (user == null || !user.hasActiveEmailVerificationToken(hash, Instant.now())) return false;
        user.markEmailVerified();
        return true;
    }

    @Transactional

    /**
     * Caps email OTP requests BEFORE the account lookup.
     *
     * <p>
     * The rate limit inside {@code OtpService.issue} only bites once a user is
     * found, so an address with no account was checked for free — and since
     * these paths now return silently for unknown addresses, that meant an
     * unlimited probe against arbitrary emails at no cost. Limiting first also
     * keeps the uniform response honest: a known and an unknown address hit the
     * same wall at the same count, so the limit itself leaks nothing.
     */
    private void checkEmailOtpRateLimit(String normalizedEmail, String requestIpAddress) {
        int windowSeconds = (int) Duration.ofMinutes(15).toSeconds();

        rateLimitService.consumeOrThrow(
                "rl:auth:email-otp:" + normalizedEmail,
                3,
                windowSeconds,
                "Too many requests for this email. Please try again later.");

        if (requestIpAddress != null && !requestIpAddress.isBlank()) {
            rateLimitService.consumeOrThrow(
                    "rl:auth:email-otp:ip:" + requestIpAddress,
                    20,
                    windowSeconds,
                    "Too many requests from this device. Please try again later.");
        }
    }

    public void requestEmailLoginOTP(String email, String requestIpAddress) {
        checkEmailOtpRateLimit(normalizeEmail(email), requestIpAddress);

        // Silent on both misses, same rule as the phone paths: a distinct answer
        // per address lets a caller test a list and learn which ones hold
        // accounts. An unverified address is skipped for the same reason — that
        // it exists but is unverified is still a fact about the account.
        Optional<User> found = userRepository.findByEmailIgnoreCaseAndActiveTrue(normalizeEmail(email));
        if (found.isEmpty() || !found.get().isEmailVerified()) {
            log.info("Email login OTP skipped: no active account with that verified email");
            return;
        }

        User user = found.get();
        otpService.issue(user.getPhone(), user.getEmail(), requestIpAddress, OtpPurpose.EMAIL_LOGIN, OtpDeliveryChannel.EMAIL);
    }

    @Transactional
    public TokenResponse loginWithEmailOTP(String email, String otp) {
        User user = findActiveByEmail(email);
        ensureVerifiedEmail(user);
        otpService.verifyAndConsumeOTP(user.getPhone(), OtpPurpose.EMAIL_LOGIN, otp);
        user.recordSuccessfulLogin(Instant.now());
        return tokenFor(user);
    }

    @Transactional
    public void requestPINResetOTPByEmail(String email, String requestIpAddress) {
        checkEmailOtpRateLimit(normalizeEmail(email), requestIpAddress);

        Optional<User> found = userRepository.findByEmailIgnoreCaseAndActiveTrue(normalizeEmail(email));
        if (found.isEmpty() || !found.get().isEmailVerified()) {
            log.info("Email PIN reset OTP skipped: no active account with that verified email");
            return;
        }

        User user = found.get();
        user.releaseExpiredLoginLock(Instant.now());
        if (user.isLoginTemporarilyLocked(Instant.now())) {
            log.info("Email PIN reset OTP skipped userId={} reason=login-locked", user.getId());
            return;
        }

        otpService.issue(user.getPhone(), user.getEmail(), requestIpAddress, OtpPurpose.PIN_RESET, OtpDeliveryChannel.EMAIL);
    }

    @Transactional
    public OtpVerifyResponse verifyOTPByEmail(String email, String otp, OtpPurpose purpose) {
        User user = findActiveByEmail(email);
        ensureVerifiedEmail(user);
        if (purpose == OtpPurpose.PIN_RESET) ensurePinResetAllowed(user, Instant.now());
        otpService.verifyOTPWithoutConsuming(user.getPhone(), purpose, otp);
        return new OtpVerifyResponse(user.getId(), !user.hasPin());
    }

    @Transactional
    public TokenResponse resetPINByEmail(String email, String otp, String newPin) {
        User user = findActiveByEmail(email);
        ensureVerifiedEmail(user);
        ensurePinResetAllowed(user, Instant.now());
        otpService.verifyAndConsumeOTP(user.getPhone(), OtpPurpose.PIN_RESET, otp);
        user.setPin(pinService.hashPIN(newPin));
        eventPublisher.publishEvent(new PinChangedEvent(user.getId()));
        return tokenFor(user);
    }

    private String newVerificationToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hashToken(String token) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(hash.length * 2);
            for (byte value : hash) result.append(String.format("%02x", value));
            return result.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }
    @Transactional
    public OtpVerifyResponse verifyOTP(String phone, String otp, OtpPurpose purpose) {
        User user = findActiveByPhone(phone);
        if (purpose == OtpPurpose.PIN_RESET) {
            ensurePinResetAllowed(user, Instant.now());
        }

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
        Instant now = Instant.now();
        user.releaseExpiredLoginLock(now);
        if (user.isLoginTemporarilyLocked(now)) {
            loginAttemptService.recordFailure(normalizedPhone, ipAddress, LoginFailureReason.ACCOUNT_LOCKED);
            throw new ValidationException("Account is temporarily locked. Try again later.");
        }

        if (!user.hasPin() || !pinService.matches(pin, user.getPinHash())) {
            int nextFailedAttempts = user.getFailedLoginAttempts() + 1;
            user.recordFailedLoginAttempt(
                    loginRateLimitProperties.progressiveLockFailedAttempts(),
                    loginRateLimitProperties.lockDurationForFailedAttempt(nextFailedAttempts),
                    now);
            loginAttemptService.recordFailure(normalizedPhone, ipAddress, LoginFailureReason.INVALID_PIN);

            if (user.isLoginTemporarilyLocked(now)) {
                log.warn(
                        "User login temporarily locked after failed attempts userId={} phone={} failedAttempts={} lockedUntil={}",
                        user.getId(),
                        user.getPhone(),
                        user.getFailedLoginAttempts(),
                        user.getLoginLockedUntil());
            }

            if (user.getFailedLoginAttempts() > loginRateLimitProperties.progressiveLockFailedAttempts()) {
                throw new ValidationException(
                        "Invalid phone or PIN. Account risk detected. Consider resetting your PIN before more failed attempts.");
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
        ensurePinResetAllowed(user, Instant.now());

        otpService.verifyAndConsumeOTP(user.getPhone(), OtpPurpose.PIN_RESET, otp);
        user.setPin(pinService.hashPIN(newPin));

        eventPublisher.publishEvent(new PinChangedEvent(user.getId()));

        return tokenFor(user);
    }


    private void ensurePinResetAllowed(User user, Instant now) {
        user.releaseExpiredLoginLock(now);
        if (user.isLoginTemporarilyLocked(now)) {
            throw new ValidationException("PIN reset is temporarily unavailable. Try again later.");
        }
    }

    /**
     * Changes the authenticated user's PIN after verifying both current PIN and
     * phone ownership through a reset OTP.
     */
    @Transactional
    public TokenResponse changePIN(UUID userId, String currentPin, String otp, String newPin) {
        User user = findActiveUserById(userId)
                .orElseThrow(() -> new NotFoundException("User", userId));

        if (!user.hasPin() || !pinService.matches(currentPin, user.getPinHash())) {
            throw new ValidationException("Current PIN is incorrect");
        }

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

            if (fullName != null && !fullName.isBlank()) {
                user.updateProfile(fullName.trim());
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
                .orElseThrow(() -> new NotFoundException("User", userId));

        user.markActiveTenant();

        log.info("User active tenant flag marked userId={}", user.getId());
    }

    /**
     * Clears the active tenant flag once a user's active tenancy is ended.
     */
    @Transactional
    public void clearActiveTenant(UUID userId) {
        User user = findActiveUserById(userId)
                .orElseThrow(() -> new NotFoundException("User", userId));

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
     * Looks up active users by id and returns public auth DTOs keyed by user id.
     */
    @Transactional(readOnly = true)
    public Map<UUID, UserSummaryResponse> findByIds(Collection<UUID> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Collections.emptyMap();
        }

        return userRepository.findAllById(userIds)
                .stream()
                .filter(user -> user.isCurrentlyActive())
                .map(user -> UserSummaryResponse.from(user))
                .collect(Collectors.toMap(UserSummaryResponse::id, Function.identity(), (left, right) -> left));
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
     * Updates editable profile details for an active authenticated user:
     * renames them, and optionally sets or clears their photo.
     *
     * <p>The photo is tri-state on purpose. Null leaves it untouched, so the
     * rename-only screen cannot wipe a photo it never asked about; blank clears
     * it; a URL replaces it. Collapsing null and blank would make every rename
     * a silent photo deletion.
     *
     * <p>The URL is expected to be a stored one — the client uploads through the
     * {@code PROFILE_PHOTO} target first. Nothing here can tell a device URI
     * from a real one, which is why the upload happens before the save rather
     * than being inferred afterwards.
     */
    @Transactional
    public UserSummaryResponse updateProfile(
            UUID userId, String fullName, String profilePhotoUrl, String profilePhotoPublicId) {
        User user = findActiveUserById(userId)
                .orElseThrow(() -> new NotFoundException("User", userId));

        user.updateProfile(fullName.trim());

        if (profilePhotoUrl != null) {
            if (profilePhotoUrl.isBlank()) {
                user.clearProfilePhoto();
            } else {
                user.updateProfilePhoto(
                        profilePhotoUrl.trim(),
                        profilePhotoPublicId == null || profilePhotoPublicId.isBlank()
                                ? null
                                : profilePhotoPublicId.trim());
            }
        }

        log.info(
                "User profile updated userId={} role={} photoChanged={}",
                user.getId(),
                user.getRole(),
                profilePhotoUrl != null);

        return UserSummaryResponse.from(user);
    }

    /**
     * Returns the authenticated user's current profile summary.
     */
    @Transactional(readOnly = true)
    public UserSummaryResponse getProfile(UUID userId) {
        User user = findActiveUserById(userId)
                .orElseThrow(() -> new NotFoundException("User", userId));

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
