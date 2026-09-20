package com.khatiyan.d_modules.verification.provider;

import java.time.LocalDate;

/**
 * What came back when the tenant's code was submitted.
 *
 * <p><b>Deliberately a narrow slice of what providers return.</b> They hand
 * back a photograph, a signed XML bundle, sometimes a PDF, and a hashed email.
 * None of that is asked for and none of it is carried past this record — a
 * field that does not exist cannot be logged, leaked or subpoenaed.
 *
 * <p>Not an exception on failure. A wrong code is an ordinary outcome of asking
 * somebody to read a text message, not an exceptional one.
 *
 * @param succeeded      whether the provider confirmed the holder
 * @param name           the name the government record holds. Matched strictly
 *                       against the tenancy — a tenancy whose name is not the
 *                       one on the document backing it is not verified, it is a
 *                       tenancy whose real name was never written down.
 * @param dateOfBirth    adopted rather than compared. Nobody needs it to agree
 *                       with what an owner typed; what a tenancy needs to know
 *                       is that the person is an adult.
 * @param maskedLastFour the last four digits of the Aadhaar — the only fragment
 *                       of the number that may be kept, and the source of the
 *                       iteration count for the mobile hash
 * @param address        the address on the record, which REPLACES whatever the
 *                       app held. Null when the provider returns none, and then
 *                       nothing is overwritten.
 * @param addressPincode likewise
 * @param hashedMobile   UIDAI's hash of the registered mobile, reproducible on
 *                       our side from a number we already hold. Null when the
 *                       provider does not return one.
 * @param failureReason  why not, phrased for the tenant to read. Null on
 *                       success.
 */
public record OkycOutcome(
        boolean succeeded,
        String name,
        LocalDate dateOfBirth,
        String maskedLastFour,
        String address,
        String addressPincode,
        String hashedMobile,
        String failureReason) {

    public static OkycOutcome verified(
            String name,
            LocalDate dateOfBirth,
            String maskedLastFour,
            String address,
            String addressPincode,
            String hashedMobile) {
        return new OkycOutcome(
                true, name, dateOfBirth, maskedLastFour, address, addressPincode, hashedMobile, null);
    }

    public static OkycOutcome rejected(String failureReason) {
        return new OkycOutcome(false, null, null, null, null, null, null, failureReason);
    }
}
