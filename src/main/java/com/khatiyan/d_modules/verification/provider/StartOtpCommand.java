package com.khatiyan.d_modules.verification.provider;

/**
 * Everything the provider needs to send a code, and nothing more.
 *
 * @param reference      our id for this attempt, echoed back so their answer
 *                       finds its way home
 * @param aadhaarNumber  twelve digits, straight from the tenant's phone. It
 *                       crosses this module and is never written down.
 * @param purpose        why we are asking, which UIDAI's offline framework
 *                       requires be stated and recorded
 * @param consentGiven   the tenant ticked the consent box. Always true in
 *                       practice — it is carried explicitly so the provider's
 *                       own consent field is fed by a real answer rather than a
 *                       hardcoded one.
 */
public record StartOtpCommand(String reference, String aadhaarNumber, String purpose, boolean consentGiven) {
}
