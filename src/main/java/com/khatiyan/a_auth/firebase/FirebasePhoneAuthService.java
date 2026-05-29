package com.khatiyan.a_auth.firebase;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import com.khatiyan.a_auth.service.PhoneNumberNormalizer;
import com.khatiyan.c_shared.exception.ValidationException;

/**
 * Verifies Firebase phone-auth ID tokens and returns the verified phone number.
 */
@Service
public class FirebasePhoneAuthService {

    private final ObjectProvider<FirebaseAuth> firebaseAuthProvider;
    private final PhoneNumberNormalizer phoneNumberNormalizer;

    public FirebasePhoneAuthService(
            ObjectProvider<FirebaseAuth> firebaseAuthProvider,
            PhoneNumberNormalizer phoneNumberNormalizer) {
        this.firebaseAuthProvider = firebaseAuthProvider;
        this.phoneNumberNormalizer = phoneNumberNormalizer;
    }

    public VerifiedFirebasePhone verifyPhoneToken(String idToken) {
        FirebaseAuth firebaseAuth = firebaseAuthProvider.getIfAvailable();
        if (firebaseAuth == null) {
            throw new ValidationException("Firebase phone auth is not enabled");
        }

        try {
            FirebaseToken token = firebaseAuth.verifyIdToken(idToken);
            Object phoneClaim = token.getClaims().get("phone_number");

            if (!(phoneClaim instanceof String phoneNumber) || !StringUtils.hasText(phoneNumber)) {
                throw new ValidationException("Firebase token does not contain a verified phone number");
            }

            return new VerifiedFirebasePhone(
                    phoneNumberNormalizer.normalize(phoneNumber),
                    token.getUid());
        } catch (FirebaseAuthException e) {
            throw new ValidationException("Invalid Firebase phone verification token");
        }
    }

    public record VerifiedFirebasePhone(
            String phone,
            String firebaseUid) {
    }
}
