package com.khatiyan.a_auth.service;

import org.springframework.stereotype.Component;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * Normalizes and validates Indian phone numbers for auth flows.
 *
 * <p>The auth module stores phone numbers in a single canonical format
 * so lookups, uniqueness checks, and JWT claims are consistent across
 * owner signup, tenant provisioning, OTP login, and PIN reset.
 */
@Component
public class PhoneNumberNormalizer {

    public String normalize(String rawPhone) {
        if (rawPhone == null || rawPhone.isBlank()) {
            throw new ValidationException("Phone number is required");
        }

        String digits = rawPhone.replaceAll("[^0-9]", "");

        if (digits.length() == 10) {
            return "+91" + digits;
        }

        if (digits.length() == 12 && digits.startsWith("91")) {
            return "+" + digits;
        }

        throw new ValidationException("Phone number must be a valid Indian mobile number");
    }
}
