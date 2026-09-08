package com.khatiyan.d_modules.billing.api.dto;

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
    @Size(max = 11) String bankIfsc,
    @Size(max = 120) String bankAccountHolder
) {
}
