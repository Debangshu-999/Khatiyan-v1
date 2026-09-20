package com.khatiyan.d_modules.verification.provider;

/**
 * The code the tenant typed, tied back to the challenge it answers.
 *
 * @param reference             our id for the attempt
 * @param providerTransactionId theirs, from {@link OtpChallenge}
 * @param otp                   six digits
 * @param purpose               repeated because providers require it on both
 *                              calls, and the two must agree
 */
public record SubmitOtpCommand(String reference, String providerTransactionId, String otp, String purpose) {
}
