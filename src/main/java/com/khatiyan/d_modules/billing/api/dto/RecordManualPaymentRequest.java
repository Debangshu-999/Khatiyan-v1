package com.khatiyan.d_modules.billing.api.dto;

import java.util.List;

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

    /**
     * Proof photos, at most two.
     *
     * <p>Two because the evidence usually comes in pairs — a cheque's face and
     * counterfoil, a card slip's merchant and customer copies, a UPI screenshot
     * and the bank's SMS. The cap is a form rule and lives here rather than in
     * the schema, so raising it is a number rather than a migration.
     */
    @Size(max = 2, message = "Attach at most two proof photos")
    List<@Size(max = 600) String> proofImageUrls,
    @Size(max = 500) String note
) {
}
