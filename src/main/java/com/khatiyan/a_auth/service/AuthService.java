package com.khatiyan.a_auth.service;

import java.time.Instant;
import java.time.LocalDate;
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
import java.util.List;
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
import com.khatiyan.a_auth.api.dto.UserSessionResponse;
import com.khatiyan.a_auth.api.dto.UpdateUserIdentityRequest;
import com.khatiyan.a_auth.api.dto.UserIdentityResponse;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.a_auth.event.PinChangedEvent;
import com.khatiyan.a_auth.event.UserRegisteredEvent;
import com.khatiyan.a_auth.model.OtpDeliveryChannel;
import com.khatiyan.a_auth.model.OtpPurpose;
import com.khatiyan.a_auth.model.Gender;
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
    private final PhoneLoginLockService phoneLoginLockService;
    private final UserSessionService userSessionService;
    private final DeviceDescriptor deviceDescriptor;
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
            PhoneLoginLockService phoneLoginLockService,
            UserSessionService userSessionService,
            DeviceDescriptor deviceDescriptor,
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
        this.phoneLoginLockService = phoneLoginLockService;
        this.userSessionService = userSessionService;
        this.deviceDescriptor = deviceDescriptor;
        this.emailVerificationLinkSender = emailVerificationLinkSender;
        this.recoveryEmailChangeNotifier = recoveryEmailChangeNotifier;
    }

    /**
     * The canonical form of an Indian mobile number.
     *
     * <p>Public so {@code AuthModule} can hand it to modules that store a phone
     * without provisioning an account — guest stays. The rule itself stays in
     * {@link PhoneNumberNormalizer}.
     */
    public String normalizePhone(String rawPhone) {
        return phoneNumberNormalizer.normalize(rawPhone);
    }

    /** Where this account is signed in, current session flagged. */
    @Transactional(readOnly = true)
    public List<UserSessionResponse> listSessions(UUID userId, UUID callerSessionId) {
        return userSessionService.listLive(userId, Instant.now()).stream()
                .map(session -> UserSessionResponse.from(session, callerSessionId))
                .toList();
    }

    /** Signs one other device out. */
    @Transactional
    public void revokeSession(UUID userId, UUID sessionRowId, UUID callerSessionId) {
        userSessionService.revoke(userId, sessionRowId, callerSessionId, Instant.now());
    }

    private TokenResponse tokenFor(User user) {
        return tokenFor(user, null);
    }

    /**
     * @param signOutSessionId a device the person picked to sign out, from the
     *     list they were shown when they hit the cap. Null on an ordinary
     *     sign-in. Safe to honour because their credentials were verified
     *     moments ago, on this same request.
     */
    private TokenResponse tokenFor(User user, UUID signOutSessionId) {
        Instant issuedAt = Instant.now();

        if (signOutSessionId != null) {
            userSessionService.revokeForSignIn(user.getId(), signOutSessionId, issuedAt);
        }

        // Re-checked even after a revoke: the chosen device might already have
        // been signed out from somewhere else while the picker was open, in
        // which case nothing was freed and the cap still applies.
        //
        // Paths that set a PIN bump credentialVersion, which revokes every
        // session before reaching here — so only PIN login and e-mail login can
        // actually be over the cap.
        userSessionService.ensureCapacity(user.getId(), issuedAt);

        JwtService.IssuedToken issued = jwtService.issue(user);

        // Recorded here rather than in each sign-in path: PIN, OTP, e-mail link,
        // Firebase and PIN reset all mint tokens through this one method, and a
        // session missed by any of them would be a device the owner cannot see
        // and cannot sign out.
        userSessionService.open(
                user.getId(),
                issued.sessionId(),
                deviceDescriptor.label(),
                deviceDescriptor.platform(),
                issuedAt,
                issued.expiresAt());

        return new TokenResponse(
                issued.token(),
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
     * Slows account creation down, per number and per address.
     *
     * <p>
     * <b>The IP limit is the one that does the work.</b> A phone-keyed bucket
     * cannot stop enumeration, because every probe uses a different number and
     * so starts on a full bucket. The address doing the walking is the only
     * thing all those requests have in common. The phone key is here for the
     * other case: somebody hammering sign-up at one number.
     *
     * <p>
     * <b>No lockout, unlike login.</b> A failed sign-in is somebody working on
     * one account, which is why escalation is right there. A register call is
     * either a real person making an account or a stranger reading a range, and
     * freezing a number for a day helps with neither — it would only hand an
     * attacker a way to keep a real person from signing up.
     *
     * <p>
     * Checked BEFORE the account lookup, so a registered and an unregistered
     * number hit the same wall at the same count. A limiter that only applied
     * to numbers with rows would be the login oracle again in a new place.
     */
    private void checkRegistrationRateLimits(String normalizedPhone, String requestIpAddress) {
        int windowSeconds = (int) Duration.ofMinutes(15).toSeconds();

        rateLimitService.consumeOrThrow(
                "rl:auth:register:phone:" + normalizedPhone,
                5,
                windowSeconds,
                "Too many sign-up attempts for this number. Please try again later.");

        if (requestIpAddress != null && !requestIpAddress.isBlank()) {
            rateLimitService.consumeOrThrow(
                    "rl:auth:register:ip:" + requestIpAddress,
                    20,
                    windowSeconds,
                    "Too many sign-up attempts from this device. Please try again later.");
        }
    }

    /**
     * Creates a self-registered normal user and starts first PIN setup
     * verification.
     */
    @Transactional
    public void registerUser(String phone, String email, String fullName, String requestIpAddress) {
        String normalizedPhone = phoneNumberNormalizer.normalize(phone);
        checkRegistrationRateLimits(normalizedPhone, requestIpAddress);

        // An account with no PIN can be several things — a tenant or a manager
        // an owner provisioned, or somebody who started signing up and walked
        // away. All four leave an identical row, so the shape is all there is to
        // go on. Whichever it is, the right answer to "sign me up" is to carry
        // on from where it was left rather than to refuse.
        Optional<User> existing = userRepository.findByPhoneAndActiveTrue(normalizedPhone);
        if (existing.isPresent()) {
            User user = existing.get();
            if (user.getRole() == UserRole.USER && !user.hasPin()) {
                // NOTHING IS WRITTEN HERE. The name and email travel with the
                // PIN instead and land in setPIN once the code is verified.
                //
                // They used to be applied right here, which meant a public
                // endpoint that knows only a phone number could rename a
                // provisioned tenant and replace their recovery email —
                // clearing emailVerified with it, so a verified address and the
                // reset path depending on it both went. No takeover: the code
                // still went to the real number. Defacement, and free.
                //
                // Tenant creation is SMS-only: no email OTP (email is optional
                // and set later in profile).
                otpService.issue(user.getPhone(), requestIpAddress, OtpPurpose.LOGIN, OtpDeliveryChannel.SMS);
                return;
            }
            throw new ValidationException("A user with this phone number already exists");
        }

        User user = registerNewAccount(phone, email, fullName, UserRole.USER);
        otpService.issue(user.getPhone(), requestIpAddress, OtpPurpose.LOGIN, OtpDeliveryChannel.SMS);
    }

    /**
     * Sends a signing code to the person's registered number.
     *
     * <p>SMS only, and to the number on the account rather than one supplied
     * with the request. A code sent to an address the caller nominated would
     * prove they control that address and nothing about who they are.
     *
     * @return the destination, masked to its last four digits, so the screen can
     *         say where the code went without restating the whole number
     */
    @Transactional
    public String startAgreementSigning(UUID userId, String requestIpAddress) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User", userId));

        otpService.issue(user.getPhone(), requestIpAddress, OtpPurpose.AGREEMENT_ACCEPTANCE, OtpDeliveryChannel.SMS);
        return maskPhone(user.getPhone());
    }

    /**
     * Checks a signing code and spends it.
     *
     * <p>Consuming rather than peeking: a code that survives its own use can
     * sign twice, and the second signature would carry the evidence of the
     * first.
     */
    @Transactional
    public String completeAgreementSigning(UUID userId, String otp) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User", userId));

        otpService.verifyAndConsumeOTP(user.getPhone(), OtpPurpose.AGREEMENT_ACCEPTANCE, otp);
        return maskPhone(user.getPhone());
    }

    /**
     * The last four digits, and nothing else.
     *
     * <p>Enough for the person to recognise the number as theirs. The whole
     * number is already on the account and does not need a second copy inside an
     * evidence record that is never deleted.
     */
    private static String maskPhone(String phone) {
        if (phone == null || phone.length() < 4) {
            return "unknown";
        }
        // The digits alone. A leading run of asterisks reads as part of the
        // number on screen, and the caller says "the number ending ..." around
        // it — the mask was doing the sentence's job badly.
        return phone.substring(phone.length() - 4);
    }

    /**
     * Creates a self-registered owner account and starts first PIN setup
     * verification.
     */
    @Transactional
    public void registerOwner(String phone, String email, String fullName, String requestIpAddress) {
        String normalizedPhone = phoneNumberNormalizer.normalize(phone);
        checkRegistrationRateLimits(normalizedPhone, requestIpAddress);

        // The same resume the tenant path gets, and it was missing. An owner who
        // started signing up and abandoned it before setting a PIN was told
        // "already exists" on every retry, forever — their only way in was the
        // provisioned-account door, which nothing pointed them at.
        //
        // Role-matched on purpose. Resuming any PIN-less account here would let
        // anyone turn a provisioned TENANT into an owner by signing up with
        // their number.
        Optional<User> existing = userRepository.findByPhoneAndActiveTrue(normalizedPhone);
        if (existing.isPresent()) {
            User user = existing.get();
            if (user.getRole() == UserRole.OWNER && !user.hasPin()) {
                otpService.issue(
                        user.getPhone(),
                        user.getEmail(),
                        requestIpAddress,
                        OtpPurpose.LOGIN,
                        OtpDeliveryChannel.SMS_AND_EMAIL);
                return;
            }
            throw new ValidationException("A user with this phone number already exists");
        }

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

        // Silent in EVERY refusal case. Not a 404, not a "you already have a
        // PIN", not a different latency — one 202 for every number on earth.
        //
        // A caller who gets a different answer per number can walk a range and
        // learn which ones hold accounts, and which of those are still waiting
        // to be set up. An unclaimed account is exactly what is worth
        // social-engineering an OTP out of. The person who really owns the
        // number learns the difference from the SMS arriving or not.
        //
        // The has-PIN branch used to answer "This number is already set up."
        // — deliberately, to save a real owner from waiting on an SMS that was
        // never coming. Changed 2026-09-06 by the user, who would rather that
        // owner hit a dead end than have the endpoint confirm, one number at a
        // time, which accounts are live. The cost is real and is accepted: type
        // your own set-up number here and you reach an OTP screen that nothing
        // ever arrives for.
        //
        // The has-PIN check still has to happen. Without it anyone could make
        // us text a setup code to an account that is already set up, and setPIN
        // refuses at the end anyway — so the code would be a live OTP sent to
        // someone who cannot use it.
        if (found.isEmpty()) {
            log.info("PIN setup OTP skipped: no active account for that number");
            return;
        }

        User user = found.get();
        if (user.hasPin()) {
            log.info("PIN setup OTP skipped userId={} reason=pin-already-set", user.getId());
            return;
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
    public TokenResponse loginWithEmailOTP(String email, String otp, UUID signOutSessionId) {
        User user = findActiveByEmail(email);
        ensureVerifiedEmail(user);
        otpService.verifyAndConsumeOTP(user.getPhone(), OtpPurpose.EMAIL_LOGIN, otp);
        user.recordSuccessfulLogin(Instant.now());
        return tokenFor(user, signOutSessionId);
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
    public TokenResponse setPIN(String phone, String otp, String pin, String fullName, String email) {
        User user = findActiveByPhone(phone);

        if (user.hasPin()) {
            throw new ValidationException("PIN is already set");
        }

        otpService.verifyAndConsumeOTP(user.getPhone(), OtpPurpose.LOGIN, otp);

        // AFTER the code, never before. Holding the number is the only thing
        // that authorises writing to this account, and this line is where that
        // becomes true. Registration deliberately writes neither.
        //
        // Only when the name actually CHANGES. updateProfile also flips
        // profileCompleted, which owners read as "this person has finished
        // setting themselves up" — and a fresh signup stored this exact name at
        // registration a minute ago, so applying it again would mark every new
        // account complete before its owner had filled in anything. A resume is
        // the case that differs: there the stored name is the placeholder the
        // property owner typed, and adopting it IS the completion.
        if (fullName != null && !fullName.isBlank() && !fullName.trim().equals(user.getFullName())) {
            user.updateProfile(fullName.trim());
        }
        if (email != null && !email.isBlank()) {
            user.updateRecoveryEmail(email);
        }

        user.setPin(pinService.hashPIN(pin));

        eventPublisher.publishEvent(new PinChangedEvent(user.getId()));

        return tokenFor(user);
    }

    /**
     * Authenticates an active user by phone and PIN, returning a JWT on success.
     */
    @Transactional(noRollbackFor = ValidationException.class)
    public TokenResponse loginWithPIN(String phone, String pin, String ipAddress, UUID signOutSessionId) {
        String normalizedPhone = phoneNumberNormalizer.normalize(phone);

        // Ahead of everything else, and phone-scoped rather than user-scoped:
        // this is the rung the progressive lock used to occupy for registered
        // numbers only. See PhoneLoginLockService for why that was readable.
        try {
            phoneLoginLockService.ensureNotLocked(normalizedPhone);
        } catch (ValidationException exception) {
            loginAttemptService.recordFailure(normalizedPhone, ipAddress, LoginFailureReason.TEMPORARY_RATE_LIMITED);
            throw exception;
        }

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
            phoneLoginLockService.recordFailure(normalizedPhone);
            loginAttemptService.recordFailure(normalizedPhone, ipAddress, LoginFailureReason.USER_NOT_FOUND);
            throw new ValidationException("Invalid phone or PIN");
        }

        User user = maybeUser.get();
        Instant now = Instant.now();
        user.releaseExpiredLoginLock(now);
        if (user.isLoginTemporarilyLocked(now)) {
            // Worded exactly like the durable rate-limit refusal, which an
            // UNREGISTERED number can also trigger. A message only a real
            // account could produce is an account-existence oracle: probe a
            // number with wrong PINs and watch whether the wording ever
            // changes. It must not.
            loginAttemptService.recordFailure(normalizedPhone, ipAddress, LoginFailureReason.ACCOUNT_LOCKED);
            throw new ValidationException("Too many login attempts for this phone. Try again later.");
        }

        if (!user.hasPin() || !pinService.matches(pin, user.getPinHash())) {
            int nextFailedAttempts = user.getFailedLoginAttempts() + 1;
            user.recordFailedLoginAttempt(
                    loginRateLimitProperties.progressiveLockFailedAttempts(),
                    loginRateLimitProperties.lockDurationForFailedAttempt(nextFailedAttempts),
                    now);
            phoneLoginLockService.recordFailure(normalizedPhone);
            loginAttemptService.recordFailure(normalizedPhone, ipAddress, LoginFailureReason.INVALID_PIN);

            if (user.isLoginTemporarilyLocked(now)) {
                log.warn(
                        "User login temporarily locked after failed attempts userId={} phone={} failedAttempts={} lockedUntil={}",
                        user.getId(),
                        user.getPhone(),
                        user.getFailedLoginAttempts(),
                        user.getLoginLockedUntil());
            }

            throw new ValidationException("Invalid phone or PIN");
        }

        user.recordSuccessfulLogin(now);
        phoneLoginLockService.clear(normalizedPhone);
        loginAttemptService.recordSuccess(normalizedPhone, ipAddress);

        return tokenFor(user, signOutSessionId);
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
     * Someone editing their own identity details.
     *
     * <p>Uses {@code updateIdentity} on the entity, which lets blanks CLEAR —
     * unlike {@link #fillMissingTenantIdentity}, where somebody else is supplying
     * what they know and must not overwrite what the person set themselves.
     */
    @Transactional
    public UserIdentityResponse updateIdentity(UUID userId, UpdateUserIdentityRequest request) {
        User user = findActiveUserById(userId)
                .orElseThrow(() -> new NotFoundException("User", userId));

        user.updateIdentity(
                request.permanentAddress(),
                request.permanentAddressPincode(),
                request.dateOfBirth(),
                request.gender());

        return UserIdentityResponse.from(userRepository.save(user));
    }

    /** The particulars a deed names a person by. See {@link UserIdentityResponse}. */
    @Transactional(readOnly = true)
    public Optional<UserIdentityResponse> findIdentity(UUID userId) {
        return userRepository.findById(userId)
                .filter(User::isCurrentlyActive)
                .map(UserIdentityResponse::from);
    }

    /**
     * Fills a tenant's blank identity fields from an owner's onboarding form.
     *
     * <p>Writes nothing over a field the tenant already has — the entity enforces
     * that, not this method, so the rule holds for any future caller. The email is
     * stored unverified.
     */
    @Transactional
    public void fillMissingTenantIdentity(
            UUID userId,
            String permanentAddress,
            String permanentAddressPincode,
            LocalDate dateOfBirth,
            Gender gender) {

        userRepository.findById(userId).ifPresent(user -> {
            if (user.fillMissingIdentity(permanentAddress, permanentAddressPincode, dateOfBirth, gender)) {
                userRepository.save(user);
            }
        });
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
