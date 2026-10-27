package com.khatiyan.d_modules.booking.model;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * The property's token rule as the tenant saw it, frozen on the request at
 * submission. The refund answer is a plain yes or no set by the owner, and it
 * applies only when the tenant is the one who walks away.
 */
public record BookingTokenTerms(boolean required, long amountPaise, boolean refundableOnTenantCancel) {

    public BookingTokenTerms {
        if (required && amountPaise <= 0) {
            throw new ValidationException("Set the token amount before taking booking requests.");
        }
        if (!required) {
            amountPaise = 0;
            refundableOnTenantCancel = false;
        }
    }

    public static BookingTokenTerms of(long amountPaise, boolean refundableOnTenantCancel) {
        return new BookingTokenTerms(true, amountPaise, refundableOnTenantCancel);
    }

    /** The owner holds beds without a token. */
    public static BookingTokenTerms waived() {
        return new BookingTokenTerms(false, 0, false);
    }

    /** What is actually owed once the rent is agreed: never more than one month of it. */
    public long dueFor(Long agreedMonthlyRentPaise) {
        long rent = BookingOffer.requireMonthlyRent(agreedMonthlyRentPaise);
        return required ? Math.min(amountPaise, rent) : 0;
    }
}
