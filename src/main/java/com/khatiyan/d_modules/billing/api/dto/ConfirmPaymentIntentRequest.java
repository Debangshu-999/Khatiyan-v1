package com.khatiyan.d_modules.billing.api.dto;

import java.util.List;

import jakarta.validation.constraints.Size;

/**
 * The tenant's "I paid" claim.
 *
 * <p>Every field is optional. A tenant who has genuinely paid should not be
 * blocked by not knowing where their banking app hides the UTR — the owner
 * still has the bill's short code in their statement, which is the match that
 * actually matters.
 */
public record ConfirmPaymentIntentRequest(
    @Size(max = 60) String referenceText,
    @Size(max = 500) String note,
    @Size(max = 2, message = "Attach at most 2 images.") List<String> proofImageUrls
) {
}
