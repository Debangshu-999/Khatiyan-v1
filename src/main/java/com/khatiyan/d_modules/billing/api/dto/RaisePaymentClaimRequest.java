package com.khatiyan.d_modules.billing.api.dto;

import java.util.List;

import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * A tenant's "I paid" for a bill, raised from a payment method's tab
 * (2026-09-28). The proof is the method's own: a UTR for UPI or a bank
 * transfer, the slip's approval code for a card, the cheque's number. Either
 * that or a photo, and neither is required.
 */
public record RaisePaymentClaimRequest(
    @NotNull(message = "Choose how you paid") ManualPaymentMethod method,
    @Size(max = 60) String referenceText,
    @Size(max = 500) String note,
    @Size(max = 2, message = "Attach at most 2 images.") List<String> proofImageUrls
) {
}
