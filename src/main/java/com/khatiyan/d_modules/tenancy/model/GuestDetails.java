package com.khatiyan.d_modules.tenancy.model;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.c_shared.exception.ValidationException;

/**
 * Who is staying, for a daily stay that has no account behind it.
 *
 * <p>This is a register entry, not a profile. A guest staying two nights never
 * signs in, so there is nobody to keep these details up to date and nothing to
 * keep them up to date for — they record what was stated at check-in and are
 * never written again.
 *
 * <p>That is why {@code age} is a number rather than a date of birth. A stored
 * DOB would quietly claim the app tracks a birthday and can recompute the age
 * later, and for a two-night stay neither is true. The owner writes down what
 * the guest said, the same as the register at a hotel desk.
 *
 * <p>Email is the only optional field. A walk-in often has no reason to give
 * one, and unlike the rest it is not part of identifying them — everything else
 * here is what the owner would be asked to produce.
 */
public record GuestDetails(
        String name,
        String phone,
        String email,
        String address,
        Integer age,
        Gender gender) {

    private static final int MIN_AGE = 18;
    private static final int MAX_AGE = 120;

    public GuestDetails {
        name = trimmedOrNull(name);
        phone = trimmedOrNull(phone);
        email = trimmedOrNull(email);
        address = trimmedOrNull(address);

        if (name == null) {
            throw new ValidationException("Guest name is required");
        }
        if (phone == null) {
            throw new ValidationException("Guest phone number is required");
        }
        if (address == null) {
            throw new ValidationException("Guest address is required");
        }
        if (age == null) {
            throw new ValidationException("Guest age is required");
        }
        // The floor is a contract age rather than an arbitrary one: the stay is
        // billed to whoever it is registered under, and a minor cannot be held
        // to that. A family checking in registers under an adult.
        if (age < MIN_AGE || age > MAX_AGE) {
            throw new ValidationException("Guest age must be between " + MIN_AGE + " and " + MAX_AGE);
        }
        if (gender == null) {
            throw new ValidationException("Guest gender is required");
        }
        if (name.length() > 120) {
            throw new ValidationException("Guest name is too long");
        }
        if (address.length() > 500) {
            throw new ValidationException("Guest address is too long");
        }
        if (email != null && !email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
            throw new ValidationException("Enter a valid email address");
        }
    }

    private static String trimmedOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
