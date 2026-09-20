package com.khatiyan.d_modules.verification.provider;

/**
 * Whoever actually talks to UIDAI on our behalf.
 *
 * <p><b>A port, because the vendor will change.</b> OTP-based offline KYC is
 * already deprecated — one major provider withdrew it outright while this was
 * being built, and UIDAI is steering the whole ecosystem towards the Aadhaar
 * App's verifiable credentials. This interface is the line that keeps that a
 * one-file problem: everything above it deals in "a check was started" and "a
 * check passed", never in anybody's endpoint shapes.
 *
 * <p>Two calls because the flow has two halves an unknown amount of time apart
 * — the tenant has to go and read a text message in between. Whether the
 * provider bills the first, the second, or both is a commercial question, so
 * the price rides on our attempt rather than being inferred from which call
 * happened.
 *
 * <p>Implementations must never log, persist or return the Aadhaar number they
 * were given.
 */
public interface AadhaarOkycProvider {

    /**
     * Asks the provider to send a one-time code to the Aadhaar-linked mobile.
     *
     * @throws com.khatiyan.c_shared.exception.BusinessException when the
     *         provider refuses — a number with no linked mobile, a malformed
     *         one, an outage. The caller turns that into a failed attempt.
     */
    OtpChallenge startOtp(StartOtpCommand command);

    /**
     * Submits the code the tenant typed.
     *
     * <p>Returns a result rather than throwing on a wrong code: a mistyped OTP
     * is an ordinary outcome of this flow, not an exceptional one, and it still
     * costs money.
     */
    OkycOutcome submitOtp(SubmitOtpCommand command);

    /** Which provider this is, for logs and for the attempt's audit trail. */
    String name();
}
