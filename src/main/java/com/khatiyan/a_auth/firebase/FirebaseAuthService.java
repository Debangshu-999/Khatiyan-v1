package com.khatiyan.a_auth.firebase;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.api.dto.OtpVerifyResponse;
import com.khatiyan.a_auth.api.dto.TokenResponse;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.a_auth.event.PinChangedEvent;
import com.khatiyan.a_auth.event.UserRegisteredEvent;
import com.khatiyan.a_auth.firebase.FirebasePhoneAuthService.VerifiedFirebasePhone;
import com.khatiyan.a_auth.model.User;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.a_auth.repository.UserRepository;
import com.khatiyan.a_auth.service.JwtService;
import com.khatiyan.a_auth.service.PinService;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;

import lombok.extern.slf4j.Slf4j;

/**
 * Owns Firebase-backed signup and login workflows.
 *
 * <p>Firebase proves phone ownership. Khatiyan still owns the user record,
 * roles, profile state, and the JWT used by the rest of the backend.
 */
@Slf4j
@Service
public class FirebaseAuthService {

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final PinService pinService;
    private final FirebasePhoneAuthService firebasePhoneAuthService;
    private final ApplicationEventPublisher eventPublisher;

    public FirebaseAuthService(
            UserRepository userRepository,
            JwtService jwtService,
            PinService pinService,
            FirebasePhoneAuthService firebasePhoneAuthService,
            ApplicationEventPublisher eventPublisher) {
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.pinService = pinService;
        this.firebasePhoneAuthService = firebasePhoneAuthService;
        this.eventPublisher = eventPublisher;
    }

    private TokenResponse tokenFor(User user) {
        return new TokenResponse(
                jwtService.issue(user),
                "Bearer",
                jwtService.accessTokenExpirySeconds(),
                UserSummaryResponse.from(user));
    }

    /**
     * Creates a normal user account after Firebase verifies phone ownership.
     */
    @Transactional
    public OtpVerifyResponse registerUser(String idToken, String fullName) {
        VerifiedFirebasePhone verifiedPhone = firebasePhoneAuthService.verifyPhoneToken(idToken);

        if (userRepository.existsByPhoneAndActiveTrue(verifiedPhone.phone())) {
            throw new ValidationException("A user with this phone number already exists");
        }

        User user = User.create(verifiedPhone.phone(), fullName.trim(), UserRole.USER);
        user.markPhoneVerified();
        userRepository.save(user);

        eventPublisher.publishEvent(new UserRegisteredEvent(
                user.getId(),
                user.getPhone(),
                user.getRole()));

        log.info(
                "Firebase user registered userId={} firebaseUid={}",
                user.getId(),
                verifiedPhone.firebaseUid());

        return new OtpVerifyResponse(user.getId(), true);
    }

    /**
     * Creates an owner account after Firebase verifies phone ownership.
     */
    @Transactional
    public OtpVerifyResponse registerOwner(String idToken, String fullName) {
        VerifiedFirebasePhone verifiedPhone = firebasePhoneAuthService.verifyPhoneToken(idToken);

        if (userRepository.existsByPhoneAndActiveTrue(verifiedPhone.phone())) {
            throw new ValidationException("A user with this phone number already exists");
        }

        User user = User.create(verifiedPhone.phone(), fullName.trim(), UserRole.OWNER);
        user.markPhoneVerified();
        userRepository.save(user);

        eventPublisher.publishEvent(new UserRegisteredEvent(
                user.getId(),
                user.getPhone(),
                user.getRole()));

        log.info(
                "Firebase owner registered userId={} firebaseUid={}",
                user.getId(),
                verifiedPhone.firebaseUid());

        return new OtpVerifyResponse(user.getId(), true);
    }

    /**
     * Re-verifies the Firebase phone proof, stores the first PIN, and returns a
     * Khatiyan JWT.
     */
    @Transactional
    public TokenResponse setPin(String idToken, String pin) {
        VerifiedFirebasePhone verifiedPhone = firebasePhoneAuthService.verifyPhoneToken(idToken);
        User user = userRepository.findByPhoneAndActiveTrue(verifiedPhone.phone())
                .orElseThrow(() -> new NotFoundException("User_", verifiedPhone.phone()));

        if (user.hasPin()) {
            throw new ValidationException("PIN is already set");
        }

        user.setPin(pinService.hashPIN(pin));
        eventPublisher.publishEvent(new PinChangedEvent(user.getId()));

        log.info(
                "Firebase PIN setup complete userId={} firebaseUid={}",
                user.getId(),
                verifiedPhone.firebaseUid());

        return tokenFor(user);
    }
}
