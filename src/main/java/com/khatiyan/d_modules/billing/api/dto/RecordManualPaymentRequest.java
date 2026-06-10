package com.khatiyan.d_modules.billing.api.dto;

import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Owner/manager request to record an offline payment for a billing cycle.
 *
 * <p>No amount is accepted: the payment covers the full cycle total (partial
 * payments are not supported yet). The cycle is marked paid on success.
 */
public record RecordManualPaymentRequest(
    @NotNull ManualPaymentMethod method,
    @Size(max = 120) String referenceText,
    @Size(max = 600) String proofImageUrl,
    @Size(max = 500) String note
) {
}
