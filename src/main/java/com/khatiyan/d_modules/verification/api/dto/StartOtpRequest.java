package com.khatiyan.d_modules.verification.api.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * The tenant's own Aadhaar number, on its way to the provider.
 *
 * <p>It is never stored, never logged and never returned. It exists inside one
 * request and then it is gone — which is the cheapest possible way to honour a
 * rule about not retaining it.
 *
 * @param consent {@code @AssertTrue}: offline verification requires the
 *                holder's consent, and an unticked box must fail rather than
 *                merely be absent
 */
public record StartOtpRequest(
        @NotBlank(message = "Enter your Aadhaar number")
        @Pattern(regexp = "^[0-9]{12}$", message = "Enter the 12 digits on your Aadhaar card")
        String aadhaarNumber,

        @AssertTrue(message = "Your consent is needed to verify your Aadhaar")
        boolean consent) {
}
