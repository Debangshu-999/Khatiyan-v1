package com.khatiyan.d_modules.tenancy.model;

import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneId;

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
 * <p><b>A date of birth, and the age worked out from it</b> (owner's rule,
 * 2026-09-27). This used to be an age as stated, on the view that a register
 * need not keep a birthday. It now takes the date of birth, because that is
 * what the owner reads off the ID they check, and the manual verification
 * makes its 18+ check against it exactly as on a monthly stay. {@code age} is
 * still carried, derived at check-in (IST), because the register and its
 * database constraint read it. Built without a date of birth (older callers),
 * the stated age stands on its own.
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
        Gender gender,
        LocalDate dateOfBirth) {

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
        if (dateOfBirth != null) {
            LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
            if (!dateOfBirth.isBefore(today)) {
                throw new ValidationException("Enter the guest's date of birth");
            }
            age = Period.between(dateOfBirth, today).getYears();
        }
        if (age == null) {
            throw new ValidationException("Guest date of birth is required");
        }
        // The floor is a contract age rather than an arbitrary one: the stay is
        // billed to whoever it is registered under, and a minor cannot be held
        // to that. A family checking in registers under an adult.
        if (age < MIN_AGE) {
            throw new ValidationException("The guest must be " + MIN_AGE + " or older");
        }
        if (age > MAX_AGE) {
            throw new ValidationException("Enter the guest's date of birth as the ID shows it");
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

    /**
     * The same entry with the phone in canonical form.
     *
     * <p>Normalizing cannot happen in the constructor: the rule lives in the
     * auth module and a record's compact constructor has nothing to inject. So
     * the service normalizes and rebuilds, and every validation here runs again
     * over the result.
     */
    public GuestDetails withPhone(String normalizedPhone) {
        return new GuestDetails(name, normalizedPhone, email, address, age, gender, dateOfBirth);
    }

    /** An entry with a stated age and no date of birth: how guests were registered before 2026-09-27. */
    public GuestDetails(String name, String phone, String email, String address, Integer age, Gender gender) {
        this(name, phone, email, address, age, gender, null);
    }

    private static String trimmedOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
