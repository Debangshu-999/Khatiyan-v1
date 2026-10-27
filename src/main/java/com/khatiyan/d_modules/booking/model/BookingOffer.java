package com.khatiyan.d_modules.booking.model;

import com.khatiyan.c_shared.exception.ValidationException;

/** Immutable offer terms. Identity/version and append-only storage follow later. */
public record BookingOffer(long monthlyRentPaise, BookingParty madeBy, boolean negotiable) {

    public BookingOffer {
        requireMonthlyRent(monthlyRentPaise);
        if (madeBy == null) {
            throw new ValidationException("The offer must identify which side made it.");
        }
        if (madeBy == BookingParty.TENANT && !negotiable) {
            throw new ValidationException("Only management can make a non-negotiable offer.");
        }
    }

    public static long requireMonthlyRent(Long rentPaise) {
        if (rentPaise == null || rentPaise <= 0) {
            throw new ValidationException("Monthly rent must be greater than zero.");
        }
        return rentPaise;
    }

    public static BookingOffer tenantProposal(Long rentPaise) {
        return new BookingOffer(requireMonthlyRent(rentPaise), BookingParty.TENANT, true);
    }

    /** A final offer without a replacement price explicitly snapshots the room rate. */
    public static BookingOffer managementOffer(Long proposedRentPaise, Long roomRentPaise, boolean negotiable) {
        if (proposedRentPaise == null && negotiable) {
            throw new ValidationException("Enter the monthly rent for your counter offer.");
        }
        long amount = requireMonthlyRent(proposedRentPaise != null ? proposedRentPaise : roomRentPaise);
        return new BookingOffer(amount, BookingParty.MANAGEMENT, negotiable);
    }
}
