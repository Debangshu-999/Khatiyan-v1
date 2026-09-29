package com.khatiyan.d_modules.billing.api.dto;

import java.util.Set;

import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * The whole set, replaced.
 *
 * <p>Every field optional: an owner who collects only in cash saves this empty
 * and is never offered in-app payment. Clearing a field is how they turn that
 * route off, which is why this is a replacement rather than a patch — a patch
 * has no way to say "remove this".
 */
public record UpdatePropertyPaymentDetailsRequest(
    @Size(max = 120) String upiVpa,
    @Size(max = 120) String payeeName,
    @Size(max = 10) String upiPhone,
    /** An uploaded image URL, not the image. Upload happens before the save. */
    @Size(max = 500) String upiQrImageUrl,
    @Size(max = 34) String bankAccountNumber,
    /**
     * Four letters, a zero, six letters or digits. Whether the branch exists is
     * checked on the screen against the bank directory (the parked payment
     * module owns that lookup, and billing may not depend on it).
     */
    @Size(max = 11)
    @Pattern(regexp = "^[A-Z]{4}0[A-Z0-9]{6}$", message = "Enter a valid IFSC. It is 11 characters: 4 letters, a 0, then 6 letters or digits.")
    String bankIfsc,
    @Size(max = 120) String bankAccountHolder,
    /**
     * The ways this property takes money (2026-09-28). Null keeps what is set,
     * so a client from before this still saves.
     */
    Set<ManualPaymentMethod> acceptedMethods,
    /** Whether cash needs the tenant's code. Null keeps what is set. */
    Boolean cashOtpRequired
) {
}
